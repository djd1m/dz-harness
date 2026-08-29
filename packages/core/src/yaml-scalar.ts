/**
 * Shared YAML frontmatter scalar escaping — single-sourced so the `cursor` and
 * `windsurf` renderers (and any future transforming renderer) escape identically
 * and can never drift apart.
 *
 * @packageDocumentation
 */

/**
 * YAML-escape a scalar for a frontmatter value. A JSON string literal is a valid
 * YAML double-quoted flow scalar, so `JSON.stringify` gives correct escaping of
 * quotes, colons, backslashes, and control characters in one deterministic step
 * (this is also how the copilot adapter escapes its `description`).
 */
export function yamlScalar(value: string): string {
  return JSON.stringify(value);
}
