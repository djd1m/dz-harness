/**
 * `dz skills-verify` — does a project's `.claude/skills/` actually REGISTER?
 *
 * Origin (feature skills-verify, ADR-001): `@dzhechkov/health-advisor` 1.2.0 shipped to npm with zero
 * skills registering while its layout test was green — the test asserted a PROXY (files on disk), not
 * the PROPERTY (registration). This module makes the property observable.
 *
 * Two layers:
 *   L1 `scanSkillsLayout`  — instant, no Claude session: which names CAN register, plus the three
 *                            layout shapes that produced the 1.2.0 defect.
 *   L2 `parseInitFacts`    — the authoritative listing, parsed from the `system/init` event of
 *      + `classifyRegistration`  `claude -p --output-format stream-json --verbose`. No model prose.
 *
 * FAIL-CLOSED: anything that prevents an honest observation yields `inconclusive`, never `pass`.
 */
/** The three non-registrable shapes, all observed in the health-advisor 1.2.0 defect. */
export type SkillIssueKind = 'no-skill-md' | 'buried-skill-md' | 'plugin-manifest-trap';
export interface SkillLayoutFinding {
    readonly dir: string;
    readonly kind: SkillIssueKind;
    readonly detail: string;
}
export interface StaticScan {
    /** The project this scan describes — evidence from another project must not be believed (QE4 #4). */
    readonly projectDir: string;
    readonly skillsRoot: string;
    readonly exists: boolean;
    /** Names that CAN register: a dir with SKILL.md exactly one level deep. */
    readonly registrable: readonly string[];
    /** Load-blocking problems: these make the verdict FAIL. */
    readonly findings: readonly SkillLayoutFinding[];
    /**
     * Reported but NOT failing. A `.claude-plugin/plugin.json` under `.claude/skills` did not register
     * in measured practice (MEASURED — reproducer: `dz skills-verify` against the published
     * health-advisor 1.2.0, whose skills were absent from a live session listing), but the layout class
     * may be supported under conditions this gate cannot observe (workspace trust). Telling the user is
     * right; failing their build over it is over-claiming.
     */
    readonly advisories: readonly SkillLayoutFinding[];
    /**
     * Plugin-shaped containers and the skill names they would provide. The layout alone cannot say
     * whether such a container loads (that depends on client support and workspace trust), so the
     * verdict ASKS THE SESSION: if none of a container's candidate names appear in the live listing,
     * it did not register and that is a failure (QE4 #1 — without this, making the container advisory
     * re-opened the vacuous pass and the gate stopped catching health-advisor 1.2.0).
     */
    readonly containers: readonly {
        readonly dir: string;
        /** Absolute path of the container — matched against `init.plugins[].path` (QE5 #1). */
        readonly path: string;
        /** The name the container's OWN manifest declares (may differ from the dir name — QE5 #1b). */
        readonly manifestName: string | null;
        /** Skill names it would provide: discovered on disk AND declared by the manifest (QE5 #4). */
        readonly candidates: readonly string[];
        /** True when the dir ALSO has a depth-1 SKILL.md — a single-skill plugin (QE5 #2). */
        readonly alsoBare: boolean;
    }[];
    /**
     * Set when the scan could not complete (unreadable dir, `.claude/skills` is a file, …). A failed
     * scan must NOT read as "a clean empty project" — the classifier turns this into `inconclusive`
     * (Codex QE #4).
     */
    readonly scanError?: string;
}
/**
 * Does this directory look like it was INTENDED as a skill? A dir with no markdown at all is
 * ordinary content (`scripts/`, `bin/`, `templates/`) — calling it a failed skill is a false FAIL
 * (Codex QE5 #7). MEASURED: naively flagging every dir marked ~40 healthy directories across 9
 * npx-toolkit packages (reproducer: the pack survey in features/skills-verify/08_qe_report.md).
 */
export declare function looksLikeSkillDir(dir: string): boolean;
/**
 * Walk `<projectDir>/.claude/skills/` and report what can register and what cannot.
 * Deterministic, needs no Claude session — safe for CI.
 */
export declare function scanSkillsLayout(projectDir: string): StaticScan;
export interface InitPlugin {
    readonly name: string;
    readonly version?: string;
    /** Where the plugin was loaded FROM — the only identity that cannot be spoofed by a name (QE5 #1). */
    readonly path?: string;
    /** e.g. `telegram@claude-plugins-official`, `health-advisor@skills-dir`. */
    readonly source?: string;
}
export interface InitFacts {
    /** Registered skill names. `null` means the key was ABSENT (schema drift) — never "none". */
    readonly skills: readonly string[] | null;
    /**
     * Registered slash-command names, e.g. `loop-designer:init` (MEASURED on Claude Code 2.1.233: the
     * `system/init` event carries a `slash_commands` array, and a plugin command registers under
     * `<plugin>:<file basename>` — its frontmatter `name:` does NOT rename it).
     *
     * `null` means the key was ABSENT or not all strings — schema drift, never "no commands". A
     * plugin whose commands silently failed to load and a Claude Code build that stopped emitting the
     * key are indistinguishable from `[]`, so `[]` is never synthesised here.
     */
    readonly slashCommands: readonly string[] | null;
    readonly plugins: readonly InitPlugin[];
    /** False when the `plugins` key was absent or not an array — unreadable, not empty (QE6 #7). */
    readonly pluginsReadable: boolean;
    /** The project the session actually read — the built-in control. */
    readonly cwd: string | null;
    readonly clientVersion: string | null;
}
/**
 * Parse the `system/init` event out of a `--output-format stream-json` stream. PURE: takes the raw
 * text, returns facts, does no IO. Returns `null` when no init event is present (→ inconclusive).
 */
/**
 * The first init event's facts. Use ONLY for "has the event arrived yet?" during streaming —
 * `classifyRegistration` deliberately does NOT accept bare facts, because the count must travel
 * with them (a caller that forgot to pass `initEventCount` got a free PASS — QE2 #2).
 */
export declare function parseInitFacts(streamText: string): InitFacts | null;
/**
 * Every `system/init` event in the stream. More than one means the observations may CONTRADICT each
 * other (Codex QE #7) — the classifier refuses to pick a winner and returns `inconclusive`.
 */
export declare function parseAllInitFacts(streamText: string): InitFacts[];
/** What a stream actually contained — facts, cardinality AND parse integrity, produced together. */
export interface StreamParse {
    readonly events: InitFacts[];
    /** A line that LOOKED like a JSON object but did not parse — possibly a truncated init (QE3 #2). */
    readonly malformedObjectLines: number;
}
export type RegistrationVerdict = 'pass' | 'fail' | 'inconclusive';
export interface RegistrationControls {
    /** Did the session read the target project? `null` when unknown (no init / no cwd). */
    readonly cwdMatched: boolean | null;
    /** Was the `skills` key present at all? A missing key is schema drift, not "nothing registered". */
    readonly skillsListPresent: boolean;
    /** Same question for `slash_commands`. `false` when absent/unreadable — never "no commands". */
    readonly commandsListPresent: boolean;
}
export interface RegistrationResult {
    readonly verdict: RegistrationVerdict;
    readonly reason: string;
    readonly expected: readonly string[];
    readonly missing: readonly string[];
    /** The `--expect-commands` set this verdict was measured against (empty when not asked). */
    readonly expectedCommands: readonly string[];
    /** Expected commands absent from the live `slash_commands` listing. */
    readonly missingCommands: readonly string[];
    readonly registeredCount: number | null;
    readonly clientVersion: string | null;
    readonly plugins: readonly InitPlugin[];
    readonly controls: RegistrationControls;
    readonly layout: readonly SkillLayoutFinding[];
    /** Reported, never fatal — see StaticScan.advisories. Rendering them is the policy (QE4 #5). */
    readonly advisories: readonly SkillLayoutFinding[];
}
/**
 * The complete evidence bundle. Every piece is REQUIRED and travels together: the previous shape let
 * a caller omit the scan error, the layout, the provenance check or the event count and get a free
 * PASS (Codex QE3 #1/#2/#4/#5). There is exactly one door into the verdict, and it is this one.
 */
export interface RegistrationEvidence {
    readonly projectDir: string;
    /** The WHOLE static scan (carries its own scanError + findings) — not hand-picked fields. */
    readonly scan: StaticScan;
    /** The probe outcome: either the raw stream, or the reason there is none. */
    readonly probe: {
        readonly ok: true;
        readonly stream: string;
    } | {
        readonly ok: false;
        readonly error: string;
    };
    /**
     * Did we actually look for same-named skills OUTSIDE this project, and what did we find?
     * `checked: false` ⇒ inconclusive: unperformed provenance discovery is not evidence of uniqueness.
     */
    readonly provenance: {
        readonly checked: boolean;
        readonly ambiguous: readonly string[];
    };
    /** Explicit `--expect` list; when absent the expectation is the scan's registrable set. */
    readonly expected?: readonly string[];
    /**
     * Explicit `--expect-commands` list, e.g. `loop-designer:init`. Absent/empty ⇒ commands are not
     * part of this vehicle's expectation (a bare skill has no commands BY DESIGN — ADR-003 D-2 — so
     * demanding them there would be a false FAIL, not a stronger gate).
     */
    readonly expectedCommands?: readonly string[];
}
export interface SkillsVerifyOptions {
    /** Must CANONICALISE (realpath) so symlinked project paths compare equal; may throw. */
    readonly resolvePath?: (p: string) => string;
}
/**
 * The single entry point. PURE apart from the injected resolver. Fail-closed by construction: `pass`
 * is reachable only from a completed scan, a probe that produced EXACTLY ONE well-formed init event
 * from THIS project, a fully-readable skills listing, a performed provenance check with no ambiguity,
 * and zero load-blocking layout findings.
 */
export declare function verifyRegistration(evidence: RegistrationEvidence, options?: SkillsVerifyOptions): RegistrationResult;
/** Exit code contract: pass=0, fail=1, inconclusive=2 (distinct so CI can treat it separately). */
export declare function registrationExitCode(verdict: RegistrationVerdict, strict?: boolean): number;
export declare function renderRegistrationReport(result: RegistrationResult, scan?: StaticScan): string;
/**
 * The names a plugin's OWN manifest says its commands and skills should register under, so a
 * `--plugin-dir` gate run can default its expectation to the manifest instead of to a hand-typed
 * list that drifts from it.
 *
 * The naming rules are MEASURED, not assumed (Claude Code 2.1.233, fixture probe 2026-08-17):
 *   · a command registers as `<plugin>:<file basename without .md>` — its frontmatter `name:` does
 *     NOT rename it (a fixture declaring `name: renamed-second` registered as `probeplug:second`);
 *   · a skill registers as `<plugin>:<directory basename>` — likewise not its frontmatter name.
 *
 * Returns `null` when the manifest is missing/unreadable/nameless: an unreadable manifest must not
 * silently become an EMPTY expectation, which is the shape that passes without checking anything.
 */
export declare function declaredPluginSurface(pluginDir: string): {
    name: string;
    skills: string[];
    commands: string[];
} | null;
/**
 * Scan a PACKAGE directory for skill dirs that could never register.
 *
 * Discriminator (MEASURED before it was chosen — a naive "every dir needs SKILL.md" rule flagged ~40
 * healthy directories across 9 npx-toolkit packages, and a markdown-based one still flagged `docs/`):
 *   1. a package counts as a SKILL PACK only if it already has at least one `<dir>/SKILL.md`;
 *   2. inside it, a dir is broken only when a `SKILL.md` EXISTS somewhere inside but not at depth 1.
 * That second rule is unambiguous — the skill file is there, just where nothing will load it (exactly
 * health-advisor 1.2.0). A dir with no SKILL.md anywhere is ordinary content, not a failed skill.
 */
export declare function findNonRegistrableSkillDirs(packDir: string): string[];
/** Build the content probe. Deliberately asks for EVIDENCE (a quoted heading), not a yes/no. */
export declare function buildContentProbePrompt(expected: readonly string[], sample?: number): string;
export type ContentProbeVerdict = 'coherent' | 'partial' | 'unusable' | 'unreadable';
export interface ContentProbeResult {
    readonly verdict: ContentProbeVerdict;
    readonly seen: readonly string[];
    readonly missing: readonly string[];
    readonly quote: string | null;
    readonly note: string;
}
/**
 * Classify the probe answer. PURE. Never upgrades anything: the worst it says is "unusable", and even
 * that is reported, never enforced. An empty or unparseable answer is `unreadable`, NOT a pass —
 * the same fail-closed instinct as the deterministic layer, applied to a much weaker signal.
 */
export declare function classifyContentProbe(answer: unknown, expected: readonly string[]): ContentProbeResult;
export declare function renderContentProbe(r: ContentProbeResult): string;
//# sourceMappingURL=skills-verify.d.ts.map