/**
 * Lifecycle hooks schema.
 *
 * A hook binds a shell command to an agent lifecycle event. The canonical model
 * here mirrors Claude Code's `settings.json` `hooks` block — the richest and
 * best-specified hook format among the target platforms — so adapters translate
 * *from* this shape rather than inventing a lossy intermediate one.
 *
 * @packageDocumentation
 */
import { z } from 'zod';
/**
 * The lifecycle events a hook may bind to. This is the Claude Code event set;
 * other platforms support a subset, and their adapters drop unsupported events
 * with a warning.
 */
export const HOOK_EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Notification',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'PreCompact',
];
/** A lifecycle event name. */
export const HookEventSchema = z.enum(HOOK_EVENTS);
/**
 * A single hook action: a shell command run when the event fires. `timeout` is
 * in seconds and, when present, must be a positive integer.
 *
 * Hook command objects are where ecosystem tooling injects extra metadata, so
 * this is a loose object: the known fields are typed, and any other key (e.g. a
 * future tooling extension) is preserved rather than rejected. `continueOnError`
 * is one such observed extension — see below.
 */
export const HookCommandSchema = z.looseObject({
    type: z.literal('command'),
    command: z.string().min(1, 'hook command must not be empty'),
    timeout: z.number().int().positive().optional(),
    /**
     * Claude Code *ecosystem* extension (emitted by AQE / ruflo tooling): when
     * true, a non-zero hook exit does not abort the lifecycle event. Not part of
     * the base Claude Code hook format — typed here because it appears in real
     * `.claude/settings.json` files this harness must validate without edits.
     */
    continueOnError: z.boolean().optional(),
});
/**
 * A matcher group: an optional `matcher` (e.g. a tool name for `PreToolUse`)
 * plus the commands that run when it matches. An absent matcher means "always".
 */
export const HookMatcherGroupSchema = z.strictObject({
    matcher: z.string().optional(),
    hooks: z.array(HookCommandSchema).min(1, 'a hook group needs at least one command'),
});
const matcherGroups = z.array(HookMatcherGroupSchema);
/**
 * The full hook configuration: every event is optional, and unknown event names
 * are rejected so that typos (`SessionStarts`) are caught at validation time.
 */
export const HookConfigSchema = z.strictObject({
    PreToolUse: matcherGroups.optional(),
    PostToolUse: matcherGroups.optional(),
    UserPromptSubmit: matcherGroups.optional(),
    Notification: matcherGroups.optional(),
    Stop: matcherGroups.optional(),
    SubagentStop: matcherGroups.optional(),
    SessionStart: matcherGroups.optional(),
    SessionEnd: matcherGroups.optional(),
    PreCompact: matcherGroups.optional(),
});
//# sourceMappingURL=hooks.schema.js.map