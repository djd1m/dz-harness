/**
 * Single-source trustTier (ADR-001, trusttier-single-source).
 *
 * A skill's `schemas/output.json` used to hardcode `properties.trustTier.const` — a second copy of the
 * `trust_tier` in its `SKILL.md` frontmatter. Nothing read the schema copy; the frontmatter is the
 * single source (`registry.ts` reads it). Two copies of a value drift by construction, and this one
 * had. This transform removes the value, leaving only a shape constraint.
 */
export interface TrustTierStripResult {
    /** The schema object, mutated in place if a const was present. */
    readonly schema: Record<string, unknown>;
    /** True iff a `const` was found under `properties.trustTier` and replaced. */
    readonly changed: boolean;
}
/**
 * Replace `properties.trustTier.const: N` with `{ minimum: 1, maximum: 3 }`, preserving every sibling
 * key (`type`, `description`, …). Idempotent: a schema that already uses a range, has no `const`, or has
 * no `trustTier`, is returned unchanged with `changed: false`.
 *
 * Pure w.r.t. inputs it does not own: it mutates the passed object (the caller owns it) and returns it,
 * so it is trivially testable without a filesystem.
 */
export declare function stripTrustTierConst(schema: Record<string, unknown>): TrustTierStripResult;
//# sourceMappingURL=skill-schema.d.ts.map