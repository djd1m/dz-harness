/**
 * Scout memory store — persists scan history between runs.
 *
 * Uses @dzhechkov/memory JsonFileBackend for zero-dependency persistence.
 * Stores RepoProfiles as MemoryRecords, tracks seen/new status, and
 * supports Reflexion feedback for user decisions.
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const DEFAULT_STORE_DIR = '.dz/scout';
const HISTORY_FILE = 'scan-history.json';
const LAST_REPORT_FILE = 'last-report.json';
const CONFIG_FILE = 'config.json';
const DEFAULT_CONFIG = { retentionDays: 90, maxEntries: 500 };
function ensureDir(dir) {
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
function readJSON(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return null;
    }
}
function writeJSON(path, data) {
    ensureDir(dirname(path));
    writeFileSync(path, JSON.stringify(data, null, 2));
}
/** Scout memory store — file-backed, zero dependencies. */
export class ScoutMemory {
    storeDir;
    history;
    config;
    /** Number of entries pruned during the most recent save(). */
    prunedLast = 0;
    constructor(storeDir) {
        this.storeDir = storeDir ?? DEFAULT_STORE_DIR;
        this.history = new Map();
        this.config = this.loadConfig();
        this.load();
    }
    /** Load config from disk (best-effort). Missing/corrupt/partial → defaults, never throws. */
    loadConfig() {
        const raw = readJSON(join(this.storeDir, CONFIG_FILE));
        if (!raw || typeof raw !== 'object')
            return DEFAULT_CONFIG;
        const retentionDays = typeof raw.retentionDays === 'number' && raw.retentionDays > 0
            ? raw.retentionDays
            : DEFAULT_CONFIG.retentionDays;
        const maxEntries = typeof raw.maxEntries === 'number' && raw.maxEntries > 0
            ? raw.maxEntries
            : DEFAULT_CONFIG.maxEntries;
        return { retentionDays, maxEntries };
    }
    /** Load history from disk. */
    load() {
        const data = readJSON(join(this.storeDir, HISTORY_FILE));
        if (data) {
            for (const record of data) {
                this.history.set(record.fullName, record);
            }
        }
    }
    /**
     * Prune stale/overflow entries in place. Non-destructive of meaningful data:
     * entries carrying a `userDecision` (human feedback) are ALWAYS preserved,
     * regardless of age or the maxEntries ceiling. Deterministic ordering.
     * @returns number of entries pruned.
     */
    prune(now = Date.now()) {
        const before = this.history.size;
        const cutoff = now - this.config.retentionDays * 24 * 60 * 60 * 1000;
        // (1) Drop entries older than retentionDays — but never a userDecision entry.
        for (const [name, rec] of this.history) {
            if (rec.userDecision !== undefined)
                continue;
            const seen = Date.parse(rec.lastSeen);
            if (Number.isFinite(seen) && seen < cutoff)
                this.history.delete(name);
        }
        // (2) Enforce maxEntries ceiling — drop oldest-by-lastSeen first, preserving
        // userDecision entries. Deterministic tiebreak by fullName.
        if (this.history.size > this.config.maxEntries) {
            const evictable = [...this.history.values()]
                .filter((r) => r.userDecision === undefined)
                .sort((a, b) => {
                const ta = Date.parse(a.lastSeen) || 0;
                const tb = Date.parse(b.lastSeen) || 0;
                if (ta !== tb)
                    return ta - tb; // oldest first
                return a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0;
            });
            let overflow = this.history.size - this.config.maxEntries;
            for (const rec of evictable) {
                if (overflow <= 0)
                    break;
                this.history.delete(rec.fullName);
                overflow--;
            }
        }
        return before - this.history.size;
    }
    /** Save history to disk (applies retention/cap first). @returns entries pruned. */
    save() {
        const pruned = this.prune();
        this.prunedLast = pruned;
        writeJSON(join(this.storeDir, HISTORY_FILE), [...this.history.values()]);
        return pruned;
    }
    /** Entries pruned during the most recent save() (retention/cap). */
    get lastPruned() {
        return this.prunedLast;
    }
    /** Check if a repo has been seen before. */
    isSeen(fullName) {
        return this.history.has(fullName);
    }
    /** Get the stored record for a repo. */
    getRecord(fullName) {
        return this.history.get(fullName);
    }
    /** Total tracked repos. */
    get size() {
        return this.history.size;
    }
    /** Update history with new scan results. Returns count of new repos. */
    ingest(repos, source) {
        const now = new Date().toISOString();
        let newCount = 0;
        for (const repo of repos) {
            // Prefer the per-repo provenance tag, then the caller-supplied source,
            // then fall back to 'unknown' only when the source is genuinely unknown.
            const resolvedSource = repo.source ?? source ?? 'unknown';
            const existing = this.history.get(repo.fullName);
            if (existing) {
                // Update lastSeen + score; upgrade a stale 'unknown' source if we now know it.
                this.history.set(repo.fullName, {
                    ...existing,
                    lastSeen: now,
                    relevanceScore: repo.relevanceScore,
                    recommendation: repo.recommendation,
                    source: existing.source && existing.source !== 'unknown'
                        ? existing.source
                        : resolvedSource,
                });
            }
            else {
                // New discovery
                this.history.set(repo.fullName, {
                    fullName: repo.fullName,
                    firstSeen: now,
                    lastSeen: now,
                    relevanceScore: repo.relevanceScore,
                    recommendation: repo.recommendation,
                    source: resolvedSource,
                });
                newCount++;
            }
        }
        this.save();
        return newCount;
    }
    /** Record a user decision for a repo (integrate/monitor/skip). */
    recordDecision(fullName, decision) {
        const existing = this.history.get(fullName);
        if (existing) {
            this.history.set(fullName, { ...existing, userDecision: decision });
            this.save();
        }
    }
    /** Compute diff between current scan and stored history. */
    diff(currentRepos) {
        const currentNames = new Set(currentRepos.map((r) => r.fullName));
        const previousNames = new Set(this.history.keys());
        const newRepos = currentRepos.filter((r) => !previousNames.has(r.fullName));
        const goneRepos = [...previousNames].filter((name) => !currentNames.has(name));
        const changedScore = [];
        for (const repo of currentRepos) {
            const prev = this.history.get(repo.fullName);
            if (prev && Math.abs(prev.relevanceScore - repo.relevanceScore) >= 5) {
                changedScore.push({
                    fullName: repo.fullName,
                    oldScore: prev.relevanceScore,
                    newScore: repo.relevanceScore,
                });
            }
        }
        return {
            newRepos,
            goneRepos,
            changedScore,
            totalPrevious: previousNames.size,
            totalCurrent: currentRepos.length,
        };
    }
    /** Save last report for offline access. */
    saveReport(report) {
        writeJSON(join(this.storeDir, LAST_REPORT_FILE), report);
    }
    /** Load last saved report. Returns null if none. */
    loadReport() {
        return readJSON(join(this.storeDir, LAST_REPORT_FILE));
    }
    /** Generate diff markdown. */
    diffMarkdown(d) {
        const lines = [
            '## 🔄 Changes Since Last Scan',
            '',
            `Previous: ${d.totalPrevious} repos | Current: ${d.totalCurrent} repos`,
            '',
        ];
        if (d.newRepos.length > 0) {
            lines.push(`### 🆕 New (${d.newRepos.length})`, '');
            for (const r of d.newRepos.slice(0, 20)) {
                lines.push(`- [${r.fullName}](${r.url}) — score ${r.relevanceScore}, ${r.recommendation}`);
            }
            lines.push('');
        }
        if (d.goneRepos.length > 0) {
            lines.push(`### ❌ Gone (${d.goneRepos.length})`, '');
            for (const name of d.goneRepos.slice(0, 10)) {
                lines.push(`- ${name}`);
            }
            lines.push('');
        }
        if (d.changedScore.length > 0) {
            lines.push(`### 📈 Score Changed (${d.changedScore.length})`, '');
            for (const c of d.changedScore.slice(0, 10)) {
                const arrow = c.newScore > c.oldScore ? '↑' : '↓';
                lines.push(`- ${c.fullName}: ${c.oldScore} → ${c.newScore} ${arrow}`);
            }
            lines.push('');
        }
        if (d.newRepos.length === 0 && d.goneRepos.length === 0 && d.changedScore.length === 0) {
            lines.push('No changes since last scan.', '');
        }
        return lines.join('\n');
    }
}
//# sourceMappingURL=memory-store.js.map