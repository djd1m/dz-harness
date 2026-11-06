/**
 * Declarative Claude Code mod intent and evidence vocabulary.
 * Parsing is offline and grants no authority to load a plugin or run a handler.
 * This is deliberately separate from settings hooks in hooks.schema.ts.
 * @packageDocumentation
 */
import { z } from 'zod';
export declare const ModHostKindSchema: z.ZodEnum<{
    terminal: "terminal";
    desktop: "desktop";
    vscode: "vscode";
    print: "print";
    sdk: "sdk";
    cloud: "cloud";
    "desktop-wsl": "desktop-wsl";
}>;
export declare const ModUiSurfaceSchema: z.ZodEnum<{
    terminal: "terminal";
    desktop: "desktop";
    vscode: "vscode";
}>;
/** Intent for one plugin and one host target. Not Claude's plugin.json format. */
export declare const ModRuntimeIntentV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"claude-code-mod">;
    plugin: z.ZodObject<{
        id: z.ZodString;
        module: z.ZodString;
        sha256: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    host: z.ZodObject<{
        kind: z.ZodEnum<{
            terminal: "terminal";
            desktop: "desktop";
            vscode: "vscode";
            print: "print";
            sdk: "sdk";
            cloud: "cloud";
            "desktop-wsl": "desktop-wsl";
        }>;
        version: z.ZodNullable<z.ZodString>;
        buildId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    handlers: z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        mode: z.ZodEnum<{
            observe: "observe";
            rewrite: "rewrite";
            answer: "answer";
        }>;
        apiCalls: z.ZodArray<z.ZodString>;
        matcherId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>>;
    renderSites: z.ZodArray<z.ZodObject<{
        surface: z.ZodEnum<{
            terminal: "terminal";
            desktop: "desktop";
            vscode: "vscode";
        }>;
        component: z.ZodString;
    }, z.core.$strict>>;
    lifecycle: z.ZodObject<{
        onReload: z.ZodLiteral<"invalidate-observations">;
        onHandlerError: z.ZodLiteral<"record-unknown">;
        onTimeout: z.ZodLiteral<"record-unknown">;
    }, z.core.$strict>;
    fallback: z.ZodObject<{
        whenUiUnavailable: z.ZodEnum<{
            "statusline-json": "statusline-json";
            "transcript-line": "transcript-line";
            "disable-ui": "disable-ui";
        }>;
        whenModUnavailable: z.ZodEnum<{
            "retain-settings-hooks": "retain-settings-hooks";
            "disable-feature": "disable-feature";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ModRuntimeIntentV1 = z.infer<typeof ModRuntimeIntentV1Schema>;
/** A report stores independent facts; it never collapses them into `active`. */
export declare const ModRuntimeObservationV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"claude-code-mod-observation">;
    pluginId: z.ZodString;
    pluginSha256: z.ZodNullable<z.ZodString>;
    host: z.ZodObject<{
        kind: z.ZodEnum<{
            terminal: "terminal";
            desktop: "desktop";
            vscode: "vscode";
            print: "print";
            sdk: "sdk";
            cloud: "cloud";
            "desktop-wsl": "desktop-wsl";
        }>;
        version: z.ZodNullable<z.ZodString>;
        buildId: z.ZodNullable<z.ZodString>;
    }, z.core.$strict>;
    sessionId: z.ZodNullable<z.ZodString>;
    facts: z.ZodObject<{
        installed: z.ZodObject<{
            state: z.ZodEnum<{
                unknown: "unknown";
                observed_yes: "observed_yes";
                observed_no: "observed_no";
                not_applicable: "not_applicable";
            }>;
            reasonCode: z.ZodString;
            evidence: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    "installed-hash": "installed-hash";
                    "explicit-refusal": "explicit-refusal";
                    "completed-probe": "completed-probe";
                    "api-return": "api-return";
                    "handler-completed": "handler-completed";
                    "ui-capture": "ui-capture";
                }>;
                ref: z.ZodString;
                at: z.ZodISODateTime;
                nonce: z.ZodNullable<z.ZodString>;
                marker: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        apiAvailable: z.ZodObject<{
            state: z.ZodEnum<{
                unknown: "unknown";
                observed_yes: "observed_yes";
                observed_no: "observed_no";
                not_applicable: "not_applicable";
            }>;
            reasonCode: z.ZodString;
            evidence: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    "installed-hash": "installed-hash";
                    "explicit-refusal": "explicit-refusal";
                    "completed-probe": "completed-probe";
                    "api-return": "api-return";
                    "handler-completed": "handler-completed";
                    "ui-capture": "ui-capture";
                }>;
                ref: z.ZodString;
                at: z.ZodISODateTime;
                nonce: z.ZodNullable<z.ZodString>;
                marker: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        handlerExecuted: z.ZodObject<{
            state: z.ZodEnum<{
                unknown: "unknown";
                observed_yes: "observed_yes";
                observed_no: "observed_no";
                not_applicable: "not_applicable";
            }>;
            reasonCode: z.ZodString;
            evidence: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    "installed-hash": "installed-hash";
                    "explicit-refusal": "explicit-refusal";
                    "completed-probe": "completed-probe";
                    "api-return": "api-return";
                    "handler-completed": "handler-completed";
                    "ui-capture": "ui-capture";
                }>;
                ref: z.ZodString;
                at: z.ZodISODateTime;
                nonce: z.ZodNullable<z.ZodString>;
                marker: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        uiDisplayed: z.ZodObject<{
            state: z.ZodEnum<{
                unknown: "unknown";
                observed_yes: "observed_yes";
                observed_no: "observed_no";
                not_applicable: "not_applicable";
            }>;
            reasonCode: z.ZodString;
            evidence: z.ZodNullable<z.ZodObject<{
                kind: z.ZodEnum<{
                    "installed-hash": "installed-hash";
                    "explicit-refusal": "explicit-refusal";
                    "completed-probe": "completed-probe";
                    "api-return": "api-return";
                    "handler-completed": "handler-completed";
                    "ui-capture": "ui-capture";
                }>;
                ref: z.ZodString;
                at: z.ZodISODateTime;
                nonce: z.ZodNullable<z.ZodString>;
                marker: z.ZodNullable<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    errors: z.ZodArray<z.ZodObject<{
        stage: z.ZodEnum<{
            load: "load";
            api: "api";
            handler: "handler";
            ui: "ui";
        }>;
        code: z.ZodString;
    }, z.core.$strict>>;
    fallback: z.ZodObject<{
        mode: z.ZodEnum<{
            "statusline-json": "statusline-json";
            "transcript-line": "transcript-line";
            "disable-ui": "disable-ui";
            "disable-feature": "disable-feature";
            none: "none";
        }>;
        state: z.ZodEnum<{
            unknown: "unknown";
            "not-needed": "not-needed";
            applied: "applied";
            failed: "failed";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type ModRuntimeObservationV1 = z.infer<typeof ModRuntimeObservationV1Schema>;
export declare function parseModRuntimeIntentJson(json: string): ModRuntimeIntentV1;
export declare function parseModRuntimeObservationJson(json: string): ModRuntimeObservationV1;
//# sourceMappingURL=mods-runtime.schema.d.ts.map