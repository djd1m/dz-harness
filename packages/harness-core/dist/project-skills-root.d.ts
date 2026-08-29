/**
 * Which root does `dz project-skills` read the manifest from?
 *
 * Field report doc-25b (2026-08-25). The Step-0 probe in `feature-adr.js` and the `PS_GUIDANCE`
 * paragraph handed to every design/code/qe stage BOTH hardcoded `cd <REPO> && dz project-skills`.
 * On a run whose REPO is an external checkout, the manifest installed in the WORKSPACE was therefore
 * unreachable: the probe answered `hasManifest:false`, the run recorded an honest `polymorphism:null`,
 * and not one project lens reached any stage. Nothing failed loudly — the run just silently became
 * generic. (How many lenses were lost on the reporting machine is NOT-ESTABLISHED — their workspace
 * is not on this host. This repo's own manifest wires 4 injections from 3 files, which says what the
 * blast radius looks like HERE and nothing about theirs. An earlier draft of this comment called their
 * number "overstated" on the strength of that local measurement; measuring one manifest and reporting
 * it as a verdict on a different one is the same error the reports themselves keep getting caught on.)
 *
 * The rule, symmetric with the doc-21 fix for the K2 gate:
 *   probe the TARGET repo first — a repo's own conventions are authoritative for that repo —
 *   and fall back to the workspace ONLY when the target has no manifest AND the workspace is a
 *   genuinely different root.
 *
 * The choice is made in the SHELL by `grep -q`, never by the dispatched agent's judgment: a model
 * asked to "pick the one that worked" is layer 4 on the cost-of-detection ladder, and this whole
 * defect class is what layer 4 costs. One builder feeds both call sites so they cannot drift apart
 * again — which is the actual bug the report describes, twice over.
 */
/**
 * The single-root form. Belt AND braces: it `cd`s to the root *and* names it with `--project`.
 *
 * `--project` alone would be enough for a current CLI — but `skills-feature-adr` ships this workflow
 * to machines whose `dz` may predate the flag, and because the known-flag list is FLAT an old CLI
 * accepts `--project` and ignores it. On such a CLI the bare `--project` form silently reads whatever
 * the dispatched agent's cwd happens to be, which is strictly worse than the `cd` it replaced. With
 * both, the command is correct on an old CLI (via the cd) and cwd-independent on a new one (via the
 * flag), and the two can never disagree because they are built from the same `root`.
 */
export declare function projectSkillsOneRoot(dzBin: string, root: string): string;
/**
 * The command the Step-0 probe runs and the command `PS_GUIDANCE` tells each stage agent to run —
 * necessarily the same string, or the stages fetch guidance from a root the probe never checked.
 *
 * `workspace` null / equal to `repo` ⇒ the plain single-root form (byte-identical to a run that has
 * nowhere else to look), so the common workspace-CWD case pays nothing for this.
 */
export declare function projectSkillsProbeCommand(dzBin: string, repo: string, workspace?: string | null): string;
//# sourceMappingURL=project-skills-root.d.ts.map