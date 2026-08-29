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
export declare const HOOK_EVENTS: readonly ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification", "Stop", "SubagentStop", "SessionStart", "SessionEnd", "PreCompact"];
/** A lifecycle event name. */
export declare const HookEventSchema: z.ZodEnum<{
    PreToolUse: "PreToolUse";
    PostToolUse: "PostToolUse";
    UserPromptSubmit: "UserPromptSubmit";
    Notification: "Notification";
    Stop: "Stop";
    SubagentStop: "SubagentStop";
    SessionStart: "SessionStart";
    SessionEnd: "SessionEnd";
    PreCompact: "PreCompact";
}>;
/** A lifecycle event a hook can bind to. */
export type HookEvent = z.infer<typeof HookEventSchema>;
/**
 * A single hook action: a shell command run when the event fires. `timeout` is
 * in seconds and, when present, must be a positive integer.
 *
 * Hook command objects are where ecosystem tooling injects extra metadata, so
 * this is a loose object: the known fields are typed, and any other key (e.g. a
 * future tooling extension) is preserved rather than rejected. `continueOnError`
 * is one such observed extension — see below.
 */
export declare const HookCommandSchema: z.ZodObject<{
    type: z.ZodLiteral<"command">;
    command: z.ZodString;
    timeout: z.ZodOptional<z.ZodNumber>;
    continueOnError: z.ZodOptional<z.ZodBoolean>;
}, z.core.$loose>;
/** A single hook action. */
export type HookCommand = z.infer<typeof HookCommandSchema>;
/**
 * A matcher group: an optional `matcher` (e.g. a tool name for `PreToolUse`)
 * plus the commands that run when it matches. An absent matcher means "always".
 */
export declare const HookMatcherGroupSchema: z.ZodObject<{
    matcher: z.ZodOptional<z.ZodString>;
    hooks: z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"command">;
        command: z.ZodString;
        timeout: z.ZodOptional<z.ZodNumber>;
        continueOnError: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$loose>>;
}, z.core.$strict>;
/** A matcher group binding commands to a (possibly filtered) event. */
export type HookMatcherGroup = z.infer<typeof HookMatcherGroupSchema>;
/**
 * The full hook configuration: every event is optional, and unknown event names
 * are rejected so that typos (`SessionStarts`) are caught at validation time.
 */
export declare const HookConfigSchema: z.ZodObject<{
    PreToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    PostToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    UserPromptSubmit: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    Notification: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    Stop: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SubagentStop: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SessionStart: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SessionEnd: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    PreCompact: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
/** A complete, validated hook configuration. */
export type HookConfig = z.infer<typeof HookConfigSchema>;
//# sourceMappingURL=hooks.schema.d.ts.map