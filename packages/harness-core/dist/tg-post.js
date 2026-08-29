import { createHash } from 'node:crypto';
/**
 * `dz tg-post` — the pure half: validate an approved draft against what Telegram will accept and
 * what the channel's own accepted design demands.
 *
 * The design is NOT this module's to invent. features/genai-tweets-channel/ carries four ACCEPTED
 * ADRs (2026-08-04): HTML mode, never MarkdownV2 (18 escapes against 3, one miss is a 400); the
 * cadence rule "no posts 00:00-06:00 MSK"; link previews off by default because x.com previews in
 * Telegram have been broken since 2022; and ADR-004's standing order — publishing stays MANUAL, and
 * autonomous publishing means REVISING the ADR, not flipping a quiet flag. This module only makes
 * those decisions checkable.
 *
 * PURE: no filesystem, no network, no clock — the timestamp arrives as a parameter, or the MSK
 * night-window rule could not be tested at all.
 */
/** Tags Bot API accepts in HTML mode (verified against the live docs, Bot API 10.2). */
export const TG_ALLOWED_TAGS = [
    'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'tg-spoiler',
    'a', 'tg-emoji', 'code', 'pre', 'blockquote',
];
/** Hard ceiling for `sendMessage.text`, characters after entity parsing. */
export const TG_TEXT_LIMIT = 4096;
/**
 * The character count Telegram limits: text WITHOUT the markup. An approximation is stated as one —
 * entities like tg-emoji count differently — but a draft within this bound by a margin is safe, and
 * the render prints the number so the author sees the headroom, not a verdict.
 */
export function tgVisibleLength(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').length;
}
/**
 * Everything wrong with a draft, or an empty list. One pass, every finding named — a validator that
 * stops at the first fault sends the author around the loop once per mistake.
 */
export function tgPostHtmlIssues(html) {
    const issues = [];
    const text = html.trim();
    if (text === '')
        return [{ kind: 'empty', detail: 'the draft is empty — nothing to send' }];
    // Tag balance over the allowed set. Telegram closes nothing for you: an unclosed <b> is a 400.
    const stack = [];
    const tagRe = /<(\/?)([a-zA-Z-]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/?)>/g;
    let covered = 0;
    for (let m = tagRe.exec(text); m !== null; m = tagRe.exec(text)) {
        covered += 1;
        const closing = m[1] === '/';
        const name = m[2].toLowerCase();
        const expandable = name === 'blockquote'; // `<blockquote expandable>` is the ADR-003 body form
        if (!TG_ALLOWED_TAGS.includes(name) && !expandable) {
            issues.push({ kind: 'unknown-tag', detail: `<${name}> is not a Bot API HTML tag — Telegram answers 400 to tags it does not know` });
            continue;
        }
        if (closing) {
            if (stack.length === 0 || stack[stack.length - 1] !== name) {
                issues.push({ kind: 'stray-close', detail: `</${name}> closes nothing that is open — tags must nest, not interleave` });
            }
            else {
                stack.pop();
            }
        }
        else if (m[4] !== '/') {
            stack.push(name);
        }
    }
    for (const open of stack) {
        issues.push({ kind: 'unclosed-tag', detail: `<${open}> is never closed — Telegram closes nothing for you, this is a 400` });
    }
    // Bare & and < outside tags: HTML mode requires entity-escaping exactly these.
    const outside = text.replace(/<[^>]*>/g, '');
    if (/&(?!(lt|gt|amp|quot|#\d+|#x[0-9a-fA-F]+);)/.test(outside)) {
        issues.push({ kind: 'bare-ampersand', detail: 'a bare & outside an entity — HTML mode needs &amp;' });
    }
    if (/</.test(outside.replace(/&lt;/g, ''))) {
        issues.push({ kind: 'bare-angle', detail: 'a bare < that is not a known tag — Telegram reads it as markup and answers 400' });
    }
    const visible = tgVisibleLength(text);
    if (visible > TG_TEXT_LIMIT) {
        issues.push({ kind: 'over-limit', detail: `${visible} visible characters against the ${TG_TEXT_LIMIT} hard limit — cut ${visible - TG_TEXT_LIMIT}` });
    }
    void covered;
    return issues;
}
/**
 * May this draft go out NOW?
 *
 * The night window is ADR-003's cadence rule, encoded as a refusal with an explicit override rather
 * than as advice: 00:00-06:00 MSK is when the channel's audience is asleep and its author is too —
 * a send landing then is far more often a timezone mistake than an intention. `--night` states the
 * intention; without it the refusal names the local MSK time it computed, so the operator can check
 * the arithmetic instead of trusting it.
 */
/**
 * The dedup key for a post: sha256 of its VISIBLE text (markup stripped). Two drafts that render
 * identically in Telegram are the same post even if their HTML differs by a whitespace — the key
 * must be about what the reader sees, not the bytes (G5, ADR-005).
 */
export function tgVisibleSha256(html) {
    const visible = html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return createHash('sha256').update(visible.trim(), 'utf-8').digest('hex');
}
export function decideTgSend(input) {
    // G6 (ADR-001 fail-closed-guard-order): the stop-cord is ABSOLUTE and FIRST — it halts even a
    // perfect post, before any cheaper check, so no bug in a later gate can route around it.
    if (input.halted === true) {
        return { action: 'refuse', reason: 'STOP-CORD engaged (.dz/tg-post/HALT exists) — nothing is published while it is present; remove the file to resume' };
    }
    if (input.issues.length > 0) {
        return { action: 'refuse', reason: `${input.issues.length} formatting issue(s) — Telegram would refuse or mangle this draft` };
    }
    // The provenance gate is not optional and "skipped" is not a pass: ADR-002 of the provenance
    // feature — nothing leaves this machine citing a source that may not.
    if (input.provenanceOutcome !== 'allowed') {
        return {
            action: 'refuse',
            reason: input.provenanceOutcome === 'skipped'
                ? 'no provenance manifest was checked — an unchecked draft is not an approved draft'
                : `the provenance gate said ${input.provenanceOutcome} — nothing goes out citing a source that may not leave this machine`,
        };
    }
    if (!input.confirmed) {
        return { action: 'refuse', reason: 'publishing is MANUAL by the channel\'s own ADR-004 — pass --send --yes to state the decision out loud' };
    }
    const utc = Date.parse(input.nowUtcIso);
    if (Number.isFinite(utc)) {
        const mskHour = new Date(utc + 3 * 3600_000).getUTCHours();
        if (mskHour < 6 && !input.nightOverride) {
            return { action: 'refuse', reason: `it is ${String(mskHour).padStart(2, '0')}:xx MSK — the channel posts nothing between 00:00 and 06:00 MSK (ADR-003). Pass --night if this is deliberate` };
        }
    }
    // G4/G5 need the journal. An UNREADABLE journal (sentLog undefined) is fail-closed: an unreadable
    // limit counter does not prove the limit is unreached (Step-0 recall — never invert fail-closed on
    // an absent/degraded input).
    if (input.sentLog === undefined) {
        return { action: 'refuse', reason: 'the send journal could not be read — an unreadable limit/dedup counter cannot show the ceiling is unreached; refusing (fail-closed)' };
    }
    // G5 dedup: this exact visible-text post already went out.
    // G5 dedup covers BOTH a completed send AND an in-flight PENDING record of the same visible text
    // (Codex A- two-phase): a pending row means a prior attempt reached the send path — do not
    // double-publish. A stuck pending is surfaced (the CLI warns) and cleared by removing its line.
    if (input.sha256 !== undefined && input.sentLog.some((r) => r.sha256 === input.sha256)) {
        const prior = input.sentLog.find((r) => r.sha256 === input.sha256);
        return { action: 'refuse', reason: (prior && prior.status === 'pending')
                ? 'a PENDING send of this exact post exists (a prior attempt reached the send path) — refusing to double-publish; if that attempt truly failed, remove its line from .dz/tg-post/sent-log.jsonl and retry'
                : 'this exact post (by visible text) has already been sent — refusing a duplicate' };
    }
    // G4 daily limit: sends in the trailing 24h against the ceiling.
    const nowMs = Date.parse(input.nowUtcIso);
    const cutoff = Number.isFinite(nowMs) ? nowMs - 24 * 3600_000 : -Infinity;
    // Only ACCEPTED sends count against the daily limit — a pending row may never have landed, so it
    // must not eat the ceiling (mirror of 'record after'): status 'pending' is excluded, 'sent'/legacy counted.
    const inWindow = input.sentLog.filter((r) => { const t = Date.parse(r.ts); return Number.isFinite(t) && t >= cutoff && r.status !== 'pending'; }).length;
    const ceiling = typeof input.maxPostsPerDay === 'number' && input.maxPostsPerDay > 0 ? Math.floor(input.maxPostsPerDay) : 10;
    if (inWindow >= ceiling) {
        return { action: 'refuse', reason: `daily limit reached: ${inWindow} post(s) sent in the last 24h, ceiling ${ceiling} (ADR-003) — the channel does not exceed its own tempo` };
    }
    return { action: 'send', reason: 'stop-cord clear, formatted, provenance-cleared, confirmed, inside hours, not a duplicate, under the daily limit' };
}
//# sourceMappingURL=tg-post.js.map