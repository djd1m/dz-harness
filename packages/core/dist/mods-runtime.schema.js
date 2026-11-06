/**
 * Declarative Claude Code mod intent and evidence vocabulary.
 * Parsing is offline and grants no authority to load a plugin or run a handler.
 * This is deliberately separate from settings hooks in hooks.schema.ts.
 * @packageDocumentation
 */
import { z } from 'zod';
import { parseStrictJson } from './integration.schema.js';
const token = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const hostVersion = z.string().min(1).max(64).regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/).nullable();
const buildId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).nullable();
const modEvent = z.string().min(1).max(128).regex(/^(?:\*|classic\.(?:\*|[A-Z][A-Za-z0-9]*)|[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)$/);
const apiCall = z.string().min(5).max(128).regex(/^\$\.[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/);
const modulePath = z.string().min(4).max(256).superRefine((value, ctx) => {
    const segments = value.slice(2).split('/');
    if (!/^\.\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/.test(value)
        || segments.some((part) => part === '.' || part === '..' || part === '')) {
        ctx.addIssue({ code: 'custom', message: 'module path must be a relative hooks module without traversal' });
    }
});
export const ModHostKindSchema = z.enum(['terminal', 'desktop', 'vscode', 'print', 'sdk', 'cloud', 'desktop-wsl']);
export const ModUiSurfaceSchema = z.enum(['terminal', 'desktop', 'vscode']);
const ModHostSchema = z.strictObject({
    kind: ModHostKindSchema,
    /** Null means not observed; it is not a minimum version. */
    version: hostVersion,
    /** Exact installed build identifier when known, otherwise null. */
    buildId,
});
const ModHandlerSchema = z.strictObject({
    event: modEvent,
    mode: z.enum(['observe', 'rewrite', 'answer']),
    apiCalls: z.array(apiCall).max(32),
    /** Matchers are described by a stable identifier; executable matcher code is not stored here. */
    matcherId: token.nullable(),
});
const ModRenderSiteSchema = z.strictObject({
    surface: ModUiSurfaceSchema,
    component: token,
});
/** Intent for one plugin and one host target. Not Claude's plugin.json format. */
export const ModRuntimeIntentV1Schema = z.strictObject({
    version: z.literal(1),
    kind: z.literal('claude-code-mod'),
    plugin: z.strictObject({
        id: token,
        /** Path relative to hooks/hooks.json, as in the official modules array. */
        module: modulePath,
        sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    }),
    host: ModHostSchema,
    handlers: z.array(ModHandlerSchema).min(1).max(64),
    renderSites: z.array(ModRenderSiteSchema).max(32),
    lifecycle: z.strictObject({
        onReload: z.literal('invalidate-observations'),
        onHandlerError: z.literal('record-unknown'),
        onTimeout: z.literal('record-unknown'),
    }),
    fallback: z.strictObject({
        whenUiUnavailable: z.enum(['statusline-json', 'transcript-line', 'disable-ui']),
        whenModUnavailable: z.enum(['retain-settings-hooks', 'disable-feature']),
    }),
}).superRefine((intent, ctx) => {
    const seen = new Set();
    for (const handler of intent.handlers) {
        const key = `${handler.event}\0${handler.matcherId ?? ''}`;
        if (seen.has(key))
            ctx.addIssue({ code: 'custom', message: `duplicate mod handler ${handler.event}` });
        seen.add(key);
    }
    if (intent.renderSites.length > 0 && !intent.handlers.some((handler) => handler.event === 'ui.render' || handler.event === '*')) {
        ctx.addIssue({ code: 'custom', message: 'render sites require a ui.render or wildcard handler' });
    }
    const expectedSurface = {
        terminal: 'terminal', desktop: 'desktop', vscode: 'vscode',
        print: null, sdk: null, cloud: null, 'desktop-wsl': null,
    };
    const expected = expectedSurface[intent.host.kind];
    if (intent.renderSites.some((site) => site.surface !== expected)) {
        ctx.addIssue({ code: 'custom', message: `render site incompatible with ${intent.host.kind} host` });
    }
});
const evidence = z.strictObject({
    kind: z.enum(['installed-hash', 'explicit-refusal', 'completed-probe', 'api-return', 'handler-completed', 'ui-capture']),
    ref: z.string().min(1).max(512).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
        .refine((value) => !value.split('/').some((part) => part === '' || part === '.' || part === '..'), 'evidence ref must be a relative artifact path'),
    at: z.iso.datetime(),
    /** Correlates a probe with the session; never a prompt or tool argument. */
    nonce: token.nullable(),
    /** A visible marker checked in the capture; required for ui-capture. */
    marker: z.string().min(1).max(128).nullable(),
}).superRefine((value, ctx) => {
    if (value.kind === 'ui-capture' && (!value.nonce || !value.marker)) {
        ctx.addIssue({ code: 'custom', message: 'UI capture requires nonce and visible marker' });
    }
});
const fact = z.strictObject({
    state: z.enum(['observed_yes', 'observed_no', 'unknown', 'not_applicable']),
    reasonCode: token,
    evidence: evidence.nullable(),
}).superRefine((value, ctx) => {
    const observed = value.state === 'observed_yes' || value.state === 'observed_no';
    if (observed !== (value.evidence !== null)) {
        ctx.addIssue({ code: 'custom', message: 'observed facts need evidence; unknown/not_applicable must not carry it' });
    }
});
/** A report stores independent facts; it never collapses them into `active`. */
export const ModRuntimeObservationV1Schema = z.strictObject({
    version: z.literal(1),
    kind: z.literal('claude-code-mod-observation'),
    pluginId: token,
    pluginSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    host: ModHostSchema,
    sessionId: token.nullable(),
    facts: z.strictObject({
        installed: fact,
        apiAvailable: fact,
        handlerExecuted: fact,
        uiDisplayed: fact,
    }),
    errors: z.array(z.strictObject({
        stage: z.enum(['load', 'api', 'handler', 'ui']),
        code: token,
    })).max(32),
    fallback: z.strictObject({
        mode: z.enum(['none', 'statusline-json', 'transcript-line', 'disable-ui', 'disable-feature']),
        state: z.enum(['not-needed', 'applied', 'failed', 'unknown']),
    }),
}).superRefine((report, ctx) => {
    const { facts } = report;
    const allowedYes = {
        installed: 'installed-hash',
        apiAvailable: 'api-return',
        handlerExecuted: 'handler-completed',
        uiDisplayed: 'ui-capture',
    };
    for (const name of Object.keys(allowedYes)) {
        const item = facts[name];
        if (item.state === 'observed_yes' && item.evidence?.kind !== allowedYes[name]) {
            ctx.addIssue({ code: 'custom', message: `${name} positive fact requires ${allowedYes[name]} evidence` });
        }
        if (item.state === 'observed_no' && !['explicit-refusal', 'completed-probe'].includes(item.evidence?.kind ?? '')) {
            ctx.addIssue({ code: 'custom', message: `${name} negative fact requires explicit refusal or completed probe` });
        }
        if (name !== 'installed' && ['observed_yes', 'observed_no'].includes(item.state)
            && (!report.sessionId || !report.host.version || !report.host.buildId || !report.pluginSha256 || !item.evidence?.nonce)) {
            ctx.addIssue({ code: 'custom', message: `${name} runtime fact requires session, exact host build, plugin hash and nonce` });
        }
    }
    if (facts.installed.state === 'observed_yes' && !report.pluginSha256) {
        ctx.addIssue({ code: 'custom', message: 'installed positive fact requires plugin hash' });
    }
    for (const name of ['installed', 'apiAvailable', 'handlerExecuted']) {
        if (facts[name].state === 'not_applicable') {
            ctx.addIssue({ code: 'custom', message: `${name} cannot be not_applicable` });
        }
    }
    const headless = ['print', 'sdk', 'cloud', 'desktop-wsl'].includes(report.host.kind);
    if (facts.uiDisplayed.state === 'not_applicable' && !headless) {
        ctx.addIssue({ code: 'custom', message: 'UI is not_applicable only on a known non-rendering host' });
    }
    if (facts.uiDisplayed.state === 'observed_yes' && ['print', 'sdk', 'cloud', 'desktop-wsl'].includes(report.host.kind)) {
        ctx.addIssue({ code: 'custom', message: `visible UI is incompatible with ${report.host.kind} host` });
    }
    if (report.fallback.mode === 'none' && ['applied', 'failed'].includes(report.fallback.state)) {
        ctx.addIssue({ code: 'custom', message: 'fallback cannot be applied or failed when mode is none' });
    }
});
export function parseModRuntimeIntentJson(json) {
    return ModRuntimeIntentV1Schema.parse(parseStrictJson(json, { label: 'mod runtime intent', maxBytes: 64 * 1024 }));
}
export function parseModRuntimeObservationJson(json) {
    return ModRuntimeObservationV1Schema.parse(parseStrictJson(json, { label: 'mod runtime observation', maxBytes: 64 * 1024 }));
}
//# sourceMappingURL=mods-runtime.schema.js.map