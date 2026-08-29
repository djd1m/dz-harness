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

import type { RepoProfile, IntelligenceReport } from './types.js';

const DEFAULT_STORE_DIR = '.dz/scout';
const HISTORY_FILE = 'scan-history.json';
const LAST_REPORT_FILE = 'last-report.json';
const CONFIG_FILE = 'config.json';

/** Retention/cap config for the scan history. Missing/corrupt → these defaults. */
export interface ScoutMemoryConfig {
  /** Drop non-decision entries older than this many days. Default 90. */
  readonly retentionDays: number;
  /** Hard ceiling on tracked entries (userDecision entries are always kept). Default 500. */
  readonly maxEntries: number;
}

const DEFAULT_CONFIG: ScoutMemoryConfig = { retentionDays: 90, maxEntries: 500 };

/** Stored scan record. */
export interface ScanRecord {
  readonly fullName: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly relevanceScore: number;
  readonly recommendation: string;
  readonly source: string;
  readonly userDecision?: string | undefined;
}

/** Diff between two scans. */
export interface ScanDiff {
  readonly newRepos: readonly RepoProfile[];
  readonly goneRepos: readonly string[];
  readonly changedScore: readonly { fullName: string; oldScore: number; newScore: number }[];
  readonly totalPrevious: number;
  readonly totalCurrent: number;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJSON<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch { return null; }
}

function writeJSON(path: string, data: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** Scout memory store — file-backed, zero dependencies. */
export class ScoutMemory {
  private readonly storeDir: string;
  private history: Map<string, ScanRecord>;
  private readonly config: ScoutMemoryConfig;
  /** Number of entries pruned during the most recent save(). */
  private prunedLast = 0;

  constructor(storeDir?: string | undefined) {
    this.storeDir = storeDir ?? DEFAULT_STORE_DIR;
    this.history = new Map();
    this.config = this.loadConfig();
    this.load();
  }

  /** Load config from disk (best-effort). Missing/corrupt/partial → defaults, never throws. */
  private loadConfig(): ScoutMemoryConfig {
    const raw = readJSON<Partial<ScoutMemoryConfig>>(join(this.storeDir, CONFIG_FILE));
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG;
    const retentionDays =
      typeof raw.retentionDays === 'number' && raw.retentionDays > 0
        ? raw.retentionDays
        : DEFAULT_CONFIG.retentionDays;
    const maxEntries =
      typeof raw.maxEntries === 'number' && raw.maxEntries > 0
        ? raw.maxEntries
        : DEFAULT_CONFIG.maxEntries;
    return { retentionDays, maxEntries };
  }

  /** Load history from disk. */
  private load() {
    const data = readJSON<ScanRecord[]>(join(this.storeDir, HISTORY_FILE));
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
  private prune(now = Date.now()): number {
    const before = this.history.size;
    const cutoff = now - this.config.retentionDays * 24 * 60 * 60 * 1000;

    // (1) Drop entries older than retentionDays — but never a userDecision entry.
    for (const [name, rec] of this.history) {
      if (rec.userDecision !== undefined) continue;
      const seen = Date.parse(rec.lastSeen);
      if (Number.isFinite(seen) && seen < cutoff) this.history.delete(name);
    }

    // (2) Enforce maxEntries ceiling — drop oldest-by-lastSeen first, preserving
    // userDecision entries. Deterministic tiebreak by fullName.
    if (this.history.size > this.config.maxEntries) {
      const evictable = [...this.history.values()]
        .filter((r) => r.userDecision === undefined)
        .sort((a, b) => {
          const ta = Date.parse(a.lastSeen) || 0;
          const tb = Date.parse(b.lastSeen) || 0;
          if (ta !== tb) return ta - tb; // oldest first
          return a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0;
        });
      let overflow = this.history.size - this.config.maxEntries;
      for (const rec of evictable) {
        if (overflow <= 0) break;
        this.history.delete(rec.fullName);
        overflow--;
      }
    }

    return before - this.history.size;
  }

  /** Save history to disk (applies retention/cap first). @returns entries pruned. */
  save(): number {
    const pruned = this.prune();
    this.prunedLast = pruned;
    writeJSON(join(this.storeDir, HISTORY_FILE), [...this.history.values()]);
    return pruned;
  }

  /** Entries pruned during the most recent save() (retention/cap). */
  get lastPruned(): number {
    return this.prunedLast;
  }

  /** Check if a repo has been seen before. */
  isSeen(fullName: string): boolean {
    return this.history.has(fullName);
  }

  /** Get the stored record for a repo. */
  getRecord(fullName: string): ScanRecord | undefined {
    return this.history.get(fullName);
  }

  /** Total tracked repos. */
  get size(): number {
    return this.history.size;
  }

  /** Update history with new scan results. Returns count of new repos. */
  ingest(repos: readonly RepoProfile[], source?: string): number {
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
          source:
            existing.source && existing.source !== 'unknown'
              ? existing.source
              : resolvedSource,
        });
      } else {
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
  recordDecision(fullName: string, decision: string) {
    const existing = this.history.get(fullName);
    if (existing) {
      this.history.set(fullName, { ...existing, userDecision: decision });
      this.save();
    }
  }

  /** Compute diff between current scan and stored history. */
  diff(currentRepos: readonly RepoProfile[]): ScanDiff {
    const currentNames = new Set(currentRepos.map((r) => r.fullName));
    const previousNames = new Set(this.history.keys());

    const newRepos = currentRepos.filter((r) => !previousNames.has(r.fullName));
    const goneRepos = [...previousNames].filter((name) => !currentNames.has(name));

    const changedScore: { fullName: string; oldScore: number; newScore: number }[] = [];
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
  saveReport(report: IntelligenceReport) {
    writeJSON(join(this.storeDir, LAST_REPORT_FILE), report);
  }

  /** Load last saved report. Returns null if none. */
  loadReport(): IntelligenceReport | null {
    return readJSON<IntelligenceReport>(join(this.storeDir, LAST_REPORT_FILE));
  }

  /** Generate diff markdown. */
  diffMarkdown(d: ScanDiff): string {
    const lines: string[] = [
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
