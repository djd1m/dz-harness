import { type RuleTemplate, type TemplateParams } from './guard-promotion.js';
import { type StubWaiver } from './no-stubs.js';
import { type GuardObservation, type VolumeShadowInput } from './guard-volume.js';
export type GuardSeverity = 'hard' | 'soft';
export type GuardOp = 'publish' | 'teach' | 'consolidate' | 'reindex';
export type GuardVerdict = 'pass' | 'warn' | 'block';
/** A declarative rule. Built-in rules ship with a checker (below); config can only tune/disable them. */
export interface GuardRule {
    readonly id: string;
    readonly severity: GuardSeverity;
    readonly ops: readonly GuardOp[];
    readonly description: string;
    /** false ⇒ the rule is disabled (config override). */
    readonly enabled?: boolean;
    /**
     * A PROMOTED rule (`dz guard promote`) carries a template + params instead of a built-in checker.
     * This is the ONLY way a rule id the engine does not know may enter the rule set — and such a rule
     * is forced SOFT unconditionally (see {@link resolveRules}).
     */
    readonly template?: RuleTemplate;
    readonly params?: TemplateParams;
}
export interface Violation {
    readonly rule: string;
    readonly severity: GuardSeverity;
    readonly detail: string;
    /** Present for promoted-template firings; ids alone do not prove equal effective rule content. */
    readonly contentAnchor?: string;
}
/** A publish-secret waiver: exact repo-relative path, with a mandatory explanation. */
interface SecretWaiver {
    readonly path?: string;
    readonly reason?: string;
}
export interface GuardResult {
    readonly op: GuardOp;
    readonly verdict: GuardVerdict;
    readonly violations: readonly Violation[];
    /** ids of the rules that ran for this op (so a report can show what was checked, not just what failed). */
    readonly checked: readonly string[];
    /** ids of the rules that ran for this op but received no input to examine. */
    readonly notEstablished: readonly string[];
    /**
     * Informational notes (FN-7): things a rule wants ON THE RECORD that are NOT violations and never
     * touch the verdict — e.g. "no-stubs: N changed scannable file(s) not scanned". A fail-open skip
     * that leaves no trace is fail-SILENT, the worst kind by the gate's own cost-of-detection
     * argument; a note is the cheap fix. Present only when non-empty.
     */
    readonly notes?: readonly string[];
    /** Versioned shadow measurements. They are evidence only and never enter the verdict reducer. */
    readonly observations?: readonly GuardObservation[];
}
/** Facts the CLI injects; each rule reads only the fields it needs. Missing evidence ⇒ that rule is skipped. */
export interface GuardFacts {
    readonly op: GuardOp;
    /** Publish-only raw volume facts. Absence preserves the legacy result shape. */
    readonly volume?: VolumeShadowInput;
    /** for no-workspace-star: each publishable package's deps map. */
    readonly packages?: readonly {
        readonly name: string;
        readonly deps: Readonly<Record<string, string>>;
    }[];
    /** for no-skill-drift: the names that byte-drift between copies (from sweepSkillDrift). */
    readonly drift?: readonly string[];
    /**
     * for codex-wrapper-for-value-stage: workflow scripts to scan, as (path, text). Absent ⇒ the
     * rule reports nothing: a guard with no evidence must stay silent rather than invent a verdict.
     */
    readonly workflowScripts?: readonly {
        readonly path: string;
        readonly text: string;
    }[];
    /** for no-secrets: labelled blobs to scan (lesson text, staged files). */
    readonly secretTargets?: readonly {
        readonly label: string;
        readonly text: string;
    }[];
    /** for no-secrets: exact path waivers; entries without a non-empty reason are ignored and noted. */
    readonly secretWaivers?: readonly SecretWaiver[];
    /** Publish secret-scan coverage gaps; skips are informational and never verdict inputs. */
    readonly secretScan?: {
        readonly skipped: number;
    };
    /** for readme-consistency: labelled (a,b) count pairs that must be equal. */
    readonly counts?: readonly {
        readonly label: string;
        readonly a: number;
        readonly b: number;
    }[];
    /** for store-bloat-cap: current learned-store size vs its cap. */
    readonly store?: {
        readonly count: number;
        readonly cap: number;
    };
    /** Advisory freshness evidence for the auto-cost outcome store. Missing evidence fails open. */
    readonly routingFreshness?: {
        readonly unfedRunIds: readonly string[];
    };
    /**
     * for marketplace-parity: the CLI's read-only regeneration result. The whole field being absent
     * means evidence could not be gathered, so this advisory rule reports nothing.
     */
    readonly marketplaceParity?: {
        /** false ⇒ this repository has no .claude-plugin/ showcase and is out of scope. */
        readonly applicable: boolean;
        /** true ⇒ exactly one of plugin.json / marketplace.json is present. */
        readonly onlyOnePresent?: boolean;
        /** true ⇒ registry-derived composition differs from a fresh regeneration. */
        readonly diverged?: boolean;
        /** Operator-owned published version, carried only to render the exact repair command. */
        readonly publishedVersion?: string;
        /** Existing published manifests that could not be read or parsed. */
        readonly manifestFailures?: readonly {
            readonly file: 'plugin.json' | 'marketplace.json';
            readonly error: string;
        }[];
        /** true ⇒ regeneration was attempted but could not complete. */
        readonly regenerateFailed?: boolean;
    };
    /** for skills-registrable: per skill pack, dirs that would ship un-registrable (no depth-1 SKILL.md). */
    readonly skillPacks?: readonly {
        readonly name: string;
        readonly nonRegistrable: readonly string[];
    }[];
    /** for readme-first: per publishable package, is a version bump staged without a README change? */
    readonly readmeFirst?: readonly {
        readonly name: string;
        readonly versionBumped: boolean;
        readonly readmeChanged: boolean;
    }[];
    /**
     * for review-round: per publishable package, does this change bump a version AND touch SOURCE, and
     * did it bring a GRADED QE report with it? `undefined` (the whole fact absent) means the tree could
     * not be read — the rule then reports nothing, which is different from reporting "no review".
     */
    readonly reviewRound?: {
        readonly packages: readonly {
            readonly name: string;
            readonly versionBumped: boolean;
            readonly sourceChanged: boolean;
        }[];
        /** grades parsed out of `features/*∕08_qe_report.md` files in this change set, in file order. */
        readonly grades: readonly {
            readonly report: string;
            readonly grade: string;
        }[];
        /**
         * Optional floor from `.dz/guard.json` → `reviewRound.minGrade`. Carried in the FACT because a
         * rule body is a pure function of facts and takes no config — and because the owner reserved the
         * choice of threshold, so the DEFAULT must stay "a grade is present".
         */
        readonly minGrade?: string | undefined;
        /**
         * `false` when the gatherer TRIED and could not read the tree. The note below fires only on
         * that, never on a caller that simply never gathered — otherwise every synthetic evaluation
         * carries a warning about evidence nobody asked for.
         */
        readonly gathered?: boolean | undefined;
    };
    /**
     * for agents-md-policy-sync: result of the pure policy drift detector, gathered by the CLI.
     * `applicable:false` is a repo whose canonical policy sources are unreadable; omission means the
     * gatherer could not obtain evidence. `fenced` says whether the repo OPTED IN — i.e. its AGENTS.md
     * already carries a `dz:policies` fence. The two combine to separate a repo that is out of scope
     * (never opted in — silent) from one that opted in and then lost its sources (loud), so the shared
     * `notes` channel does not carry a permanent "not applicable" line in every consumer repo.
     */
    readonly policyDrift?: {
        readonly applicable: boolean;
        readonly drifted: readonly string[];
        readonly fenced?: boolean;
    };
    /**
     * for lockfile-in-sync: what each workspace package DECLARES vs what pnpm-lock.yaml RECORDS for that
     * importer. `parsed:false` (or the fact absent) ⇒ the rule reports nothing — fail-open by construction,
     * because a lockfile we could not read is not evidence of a defect.
     */
    /**
     * for TEMPLATE rules (promoted by `dz guard promote`): the change under evaluation — the file list
     * of the working-tree diff, plus the text of those files when a `format-match` rule needs it.
     * ABSENT ⇒ every template rule reports NOTHING (fail-open on missing evidence, the same contract
     * `lockfile-in-sync` follows).
     */
    readonly change?: {
        readonly files: readonly string[];
        readonly contents?: Readonly<Record<string, string>>;
        /**
         * FN-7: how many changed STUB-SCANNABLE files the gatherer did NOT read (deleted, non-regular,
         * oversize, read error, or beyond the file cap). The no-stubs scan stays fail-open on each of
         * them — but the skip must be ON THE RECORD (a GuardResult note), never silent.
         */
        readonly stubSkipped?: number;
    };
    /**
     * for no-stubs: config waivers from `.dz/guard.json` `stubWaivers: [{path, reason}]` — path-keyed,
     * reason MANDATORY (the feature-adr-setup --guards shape). The scan itself reads `change.files` +
     * `change.contents`, the SAME working-tree diff every other diff-aware rule uses.
     */
    readonly stubWaivers?: readonly StubWaiver[];
    /**
     * for licence-hold: per package that DECLARES a licence hold (package.json `licenseHold` field —
     * ADR-001 of feature hermes-claude-adaptation), the raw evidence the checker needs. The checker
     * fires only for packs that are actually publishable (`privateFlag !== true`): while `private:true`
     * the npm layer itself refuses, and blocking every unrelated publish for a parked pack would train
     * the --no-guard habit. The moment `private` is dropped without the hold being satisfied, this rule
     * HARD-blocks publish.
     */
    readonly licenceHold?: readonly {
        readonly name: string;
        readonly privateFlag: boolean;
        /** LICENSE file text; null ⇒ absent. */
        readonly licenseText: string | null;
        /** THIRD_PARTY_NOTICES(.md) text; null ⇒ absent. */
        readonly noticesText: string | null;
        /** package.json `license` field. */
        readonly licenseField: string | null;
    }[];
    readonly lockfile?: {
        readonly parsed: boolean;
        readonly importers?: readonly {
            /** importer path as pnpm keys it, e.g. `packages/@dzhechkov/harness-cli`. */
            readonly importer: string;
            /** the `@dzhechkov/*` specs the package.json declares (deps + devDeps). */
            readonly declared: Readonly<Record<string, string>>;
            /** the specs pnpm-lock.yaml records for this importer; `undefined` ⇒ the importer is absent. */
            readonly locked?: Readonly<Record<string, string>> | undefined;
        }[];
    };
}
/** The lowest `lockfileVersion` whose importers carry the `specifier:`/`version:` pair this parser reads. */
export declare const MIN_RECOGNISED_LOCKFILE_VERSION = 9;
/**
 * RECOGNISE-OR-REFUSE `pnpm-lock.yaml` importers parser — PURE, no YAML dependency. Reads exactly one
 * shape: `importers:` → `<path>:` → `<section>:` → `'<dep>':` → `specifier: <value>` (lockfileVersion 9+).
 *
 * "Tolerant" must mean *refuses to guess*, NOT *guesses quietly*. A half-parse is the dangerous outcome:
 * a lockfileVersion-6 file lists deps as `dep: version` one-liners under a separate `specifiers:` map, so
 * a lenient reader finds the importer KEYS, records ZERO specifiers, and the rule then reports every real
 * dependency as *"not recorded in pnpm-lock.yaml"* — a false-positive storm dressed up as fail-open. So we
 * return `undefined` (⇒ the rule reports NOTHING) unless every one of these holds:
 *   1. `lockfileVersion` is present and ≥ {@link MIN_RECOGNISED_LOCKFILE_VERSION};
 *   2. an `importers:` section exists and yields at least one importer;
 *   3. no legacy inline `dep: value` line appears at dependency depth (the v5/v6 shape);
 *   4. at least one `specifier:` was read, and NO importer came out empty (a truncated file, or a shape
 *      we do not understand, always trips this).
 *
 * `dependencies` and `devDependencies` are merged: a dep appears in only one of them per importer, and
 * the rule compares specifier strings only.
 */
export declare function parsePnpmLockImporters(lockText: unknown): Record<string, Record<string, string>> | undefined;
/** The built-in rule set (works with no config). Ops are the mutating operations each rule guards. */
export declare const DEFAULT_RULES: readonly GuardRule[];
/** The exact placeholder LICENSE marker the licence-hold rule looks for (shared with pack tests). */
export declare const LICENCE_HOLD_PENDING_MARKER = "<!-- PENDING:";
/**
 * Secret patterns — high-signal, low-false-positive. Each is anchored to a real credential shape, so ordinary
 * prose does not trip it. Extend deliberately (a broad `[A-Za-z0-9]{32}` would flag every hash).
 */
export declare const SECRET_PATTERNS: readonly {
    readonly name: string;
    readonly re: RegExp;
}[];
/** Scan text for secret shapes. Returns each match's pattern name (deduped) — never throws on hostile input. */
export declare function scanSecrets(text: unknown): {
    readonly name: string;
}[];
/**
 * Rules that may NEVER be promoted to HARD, whatever a config says. A rule whose evidence comes from a
 * deliberately tolerant parser must not be able to BLOCK an operation: the parser's own design admits it
 * may not understand a file, and "I might be wrong" plus "block the publish" is the wrong pair. Disabling
 * such a rule stays allowed — only the promotion is refused.
 */
export declare const SOFT_ONLY_RULES: readonly string[];
/**
 * A well-formed PROMOTED rule: an id the engine does not know, made enforceable by a template +
 * params from the fixed `dz guard promote` vocabulary. Anything half-formed is NOT one, so a
 * hand-edited config cannot smuggle an id past the un-enforceable-rule fail-safe by sprinkling a
 * `template` key on it.
 */
export declare function isTemplateRule(r: Partial<GuardRule> | null | undefined): r is GuardRule & {
    template: RuleTemplate;
    params: TemplateParams;
};
/**
 * Merge a user config over the defaults: override severity, disable (enabled:false), never add an
 * un-checked rule — EXCEPT a well-formed template rule (a `dz guard promote` promotion), which is
 * enforceable by construction and is forced SOFT.
 */
export declare function resolveRules(userRules?: readonly Partial<GuardRule>[]): GuardRule[];
/**
 * Evaluate the guard for one operation over injected facts. Fail-safe: a checker that throws is caught and
 * DEMOTED to a HARD violation (a rule that cannot decide must not silently pass). Verdict: any hard violation
 * ⇒ block; else any soft ⇒ warn; else pass.
 */
export declare function evaluateGuard(facts: GuardFacts, rules?: readonly GuardRule[]): GuardResult;
/** An append-only audit record. `ts` is injected by the caller (no wall-clock here → deterministic tests). */
export interface GuardAuditRecord {
    readonly ts: string;
    readonly op: GuardOp;
    readonly verdict: GuardVerdict;
    readonly violations: readonly Violation[];
    /** informational notes (FN-7 — e.g. the no-stubs skipped-files note); on the record, never a verdict input. */
    readonly notes?: readonly string[];
    /** Shadow measurements copied without recomputation from the evaluated result. */
    readonly observations?: readonly GuardObservation[];
    /** set when the operator overrode a block with `--force <reason>` — the override is logged, never silent. */
    readonly override?: {
        readonly forced: true;
        readonly reason: string;
    };
}
/** Build the audit record for a guard evaluation (+ an optional forced-override reason). Pure. */
export declare function auditRecord(result: GuardResult, ts: string, override?: {
    reason: string;
}): GuardAuditRecord;
/** The exit-code contract: a block is non-zero unless forced; a warn/pass is zero. */
export declare function guardExitCode(result: GuardResult, forced: boolean): number;
export {};
//# sourceMappingURL=guard.d.ts.map