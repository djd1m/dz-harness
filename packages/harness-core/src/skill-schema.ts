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
export function stripTrustTierConst(schema: Record<string, unknown>): TrustTierStripResult {
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== 'object') return { schema, changed: false };

  const tt = props.trustTier as Record<string, unknown> | undefined;
  // Cross-model review: `'const' in tt` also matches an INHERITED const on the prototype, and
  // `!== undefined` cannot tell 'key absent' from 'key present, value undefined'. Use own-property
  // checks throughout so a crafted object cannot trick the transform.
  if (!tt || typeof tt !== 'object' || !Object.hasOwn(tt, 'const')) return { schema, changed: false };

  // Preserve type/description; drop the value; add the range. Order kept sane for a clean diff:
  // type (if any) → minimum → maximum → description (if any) → any other siblings.
  const { const: _dropped, type, description, ...rest } = tt as {
    const: unknown;
    type?: unknown;
    description?: unknown;
  } & Record<string, unknown>;

  const rebuilt: Record<string, unknown> = {};
  rebuilt.type = Object.hasOwn(tt, 'type') ? type : 'integer';
  rebuilt.minimum = 1;
  rebuilt.maximum = 3;
  if (Object.hasOwn(tt, 'description')) rebuilt.description = description;
  // `rest` already excludes const/type/description via destructuring; Object.entries is own-keys only.
  for (const [k, v] of Object.entries(rest)) rebuilt[k] = v;

  props.trustTier = rebuilt;
  return { schema, changed: true };
}
