/**
 * Canonical, target-neutral integration intent.
 *
 * The manifest is data, never authority to execute. Consumers must validate it
 * here, then independently authorize and prove a target carrier before writing.
 *
 * @packageDocumentation
 */
import { z } from 'zod';
export declare const INTEGRATION_MANIFEST_MAX_BYTES: number;
export declare const INTEGRATION_MANIFEST_MAX_DEPTH = 16;
export declare const INTEGRATION_REGISTRATION_MAX_COUNT = 128;
export declare const INTEGRATION_ARG_MAX_COUNT = 128;
export declare const INTEGRATION_ARG_MAX_BYTES: number;
export declare const INTEGRATION_ID_PATTERN: RegExp;
export declare const ENV_NAME_PATTERN: RegExp;
/** Conservative scanner used only on executable/string fields. */
export declare function containsLiteralSecret(value: string): boolean;
export declare const McpStdioIntentSchema: z.ZodObject<{
    transport: z.ZodLiteral<"stdio">;
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    envFrom: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const McpHttpIntentSchema: z.ZodObject<{
    transport: z.ZodLiteral<"http">;
    url: z.ZodString;
    headersFrom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strict>;
export declare const McpServerIntentSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    transport: z.ZodLiteral<"stdio">;
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    envFrom: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>, z.ZodObject<{
    transport: z.ZodLiteral<"http">;
    url: z.ZodString;
    headersFrom: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strict>], "transport">;
export declare const IntegrationHookIntentSchema: z.ZodObject<{
    PreToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    PostToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    UserPromptSubmit: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    Notification: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    Stop: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SubagentStop: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SessionStart: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    SessionEnd: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    PreCompact: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            timeout: z.ZodOptional<z.ZodNumber>;
            continueOnError: z.ZodOptional<z.ZodBoolean>;
            command: z.ZodString;
        }, z.core.$loose>>;
    }, z.core.$strict>>>;
    id: z.ZodString;
}, z.core.$strict>;
export declare const HarnessIntegrationManifestV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    mcpServers: z.ZodOptional<z.ZodType<Record<string, {
        transport: "stdio";
        command: string;
        args?: string[] | undefined;
        envFrom?: string[] | undefined;
    } | {
        transport: "http";
        url: string;
        headersFrom?: Record<string, string> | undefined;
    }>, unknown, z.core.$ZodTypeInternals<Record<string, {
        transport: "stdio";
        command: string;
        args?: string[] | undefined;
        envFrom?: string[] | undefined;
    } | {
        transport: "http";
        url: string;
        headersFrom?: Record<string, string> | undefined;
    }>, unknown>>>;
    hooks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        PreToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        PostToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        UserPromptSubmit: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        Notification: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        Stop: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        SubagentStop: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        SessionStart: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        SessionEnd: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        PreCompact: z.ZodOptional<z.ZodArray<z.ZodObject<{
            matcher: z.ZodOptional<z.ZodString>;
            hooks: z.ZodArray<z.ZodObject<{
                type: z.ZodLiteral<"command">;
                timeout: z.ZodOptional<z.ZodNumber>;
                continueOnError: z.ZodOptional<z.ZodBoolean>;
                command: z.ZodString;
            }, z.core.$loose>>;
        }, z.core.$strict>>>;
        id: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type McpStdioIntent = z.infer<typeof McpStdioIntentSchema>;
export type McpHttpIntent = z.infer<typeof McpHttpIntentSchema>;
export type McpServerIntent = z.infer<typeof McpServerIntentSchema>;
export type IntegrationHookIntent = z.infer<typeof IntegrationHookIntentSchema>;
export type HarnessIntegrationManifestV1 = z.infer<typeof HarnessIntegrationManifestV1Schema>;
/**
 * Strict JSON reader with duplicate-key, reserved-key, byte and nesting checks.
 * It builds null-prototype objects so later merge code cannot inherit authority.
 */
export declare function parseStrictJson(text: string, options?: {
    readonly label?: string;
    readonly maxBytes?: number;
    readonly maxDepth?: number;
}): unknown;
export declare function parseHarnessIntegrationManifestJson(text: string): HarnessIntegrationManifestV1;
/** Deterministic JSON used for consent and evidence digests. */
export declare function canonicalIntegrationJson(value: unknown): string;
/** Content-bound digest over the final aggregate, not merely each source file. */
export declare function integrationManifestDigest(manifests: readonly HarnessIntegrationManifestV1[]): string;
//# sourceMappingURL=integration.schema.d.ts.map