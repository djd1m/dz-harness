/**
 * The platform-adapter contract.
 *
 * Every `@dzhechkov/adapter-*` package implements {@link Adapter}: a pure
 * function that compiles a {@link CanonicalSkill} into the file layout a
 * specific agent platform expects. Keeping this contract in `core` lets
 * adapters be tested in isolation and swapped freely.
 *
 * @packageDocumentation
 */
/** The agent platforms the harness can emit for. */
export const PLATFORMS = ['claude', 'codex', 'opencode', 'hermes', 'openclaude', 'copilot', 'agents-md', 'cursor', 'gemini', 'windsurf'];
//# sourceMappingURL=adapter.js.map