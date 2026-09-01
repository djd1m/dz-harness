/**
 * Canonical, target-neutral integration intent.
 *
 * The manifest is data, never authority to execute. Consumers must validate it
 * here, then independently authorize and prove a target carrier before writing.
 *
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HookCommandSchema, HOOK_EVENTS } from './hooks.schema.js';
export const INTEGRATION_MANIFEST_MAX_BYTES = 256 * 1024;
export const INTEGRATION_MANIFEST_MAX_DEPTH = 16;
export const INTEGRATION_REGISTRATION_MAX_COUNT = 128;
export const INTEGRATION_ARG_MAX_COUNT = 128;
export const INTEGRATION_ARG_MAX_BYTES = 8 * 1024;
export const INTEGRATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const integrationId = z.string().regex(INTEGRATION_ID_PATTERN, 'integration id must be 1-64 ASCII letters, digits, dot, underscore, or hyphen');
const envName = z.string().regex(ENV_NAME_PATTERN, 'environment reference must be an environment-variable name');
const SECRET_LITERAL_PATTERNS = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /(?:^|[^A-Za-z0-9])(?:sk|rk|pk|ghp|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{12,}/i,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
    /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^$\s{][^\s]{3,}/i,
];
/** Conservative scanner used only on executable/string fields. */
export function containsLiteralSecret(value) {
    return SECRET_LITERAL_PATTERNS.some((pattern) => pattern.test(value));
}
const executableString = z.string().min(1).superRefine((value, ctx) => {
    if (Buffer.byteLength(value, 'utf8') > INTEGRATION_ARG_MAX_BYTES) {
        ctx.addIssue({ code: 'custom', message: `value exceeds ${INTEGRATION_ARG_MAX_BYTES} UTF-8 bytes` });
    }
    if (containsLiteralSecret(value)) {
        ctx.addIssue({ code: 'custom', message: 'literal credential-like value is forbidden; use a symbolic environment reference' });
    }
});
export const McpStdioIntentSchema = z.strictObject({
    transport: z.literal('stdio'),
    command: executableString,
    args: z.array(executableString).max(INTEGRATION_ARG_MAX_COUNT).optional(),
    envFrom: z.array(envName).max(INTEGRATION_REGISTRATION_MAX_COUNT).optional(),
});
export const McpHttpIntentSchema = z.strictObject({
    transport: z.literal('http'),
    url: executableString.url(),
    headersFrom: z.record(z.string().min(1).max(256), envName).optional(),
});
export const McpServerIntentSchema = z.discriminatedUnion('transport', [
    McpStdioIntentSchema,
    McpHttpIntentSchema,
]);
const hookMatcherGroups = z.array(z.strictObject({
    matcher: z.string().optional(),
    hooks: z.array(HookCommandSchema.extend({ command: executableString })).min(1),
}));
const hookShape = Object.fromEntries(HOOK_EVENTS.map((event) => [event, hookMatcherGroups.optional()]));
export const IntegrationHookIntentSchema = z.strictObject({
    id: integrationId,
    ...hookShape,
}).superRefine((hook, ctx) => {
    if (!HOOK_EVENTS.some((event) => hook[event] !== undefined)) {
        ctx.addIssue({ code: 'custom', message: 'hook integration must declare at least one lifecycle event' });
    }
});
function safeRecord(valueSchema) {
    return z.record(integrationId, valueSchema).superRefine((record, ctx) => {
        for (const key of Object.keys(record)) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) {
                ctx.addIssue({ code: 'custom', message: `inherited key ${JSON.stringify(key)} is forbidden` });
            }
        }
    });
}
export const HarnessIntegrationManifestV1Schema = z.strictObject({
    version: z.literal(1),
    mcpServers: safeRecord(McpServerIntentSchema).optional(),
    hooks: z.array(IntegrationHookIntentSchema).optional(),
}).superRefine((manifest, ctx) => {
    const mcpIds = Object.keys(manifest.mcpServers ?? {});
    const hookIds = (manifest.hooks ?? []).map((hook) => hook.id);
    const count = mcpIds.length + hookIds.length;
    if (count > INTEGRATION_REGISTRATION_MAX_COUNT) {
        ctx.addIssue({ code: 'custom', message: `manifest has ${count} registrations; maximum is ${INTEGRATION_REGISTRATION_MAX_COUNT}` });
    }
    const seen = new Set();
    for (const id of [...mcpIds, ...hookIds]) {
        if (seen.has(id))
            ctx.addIssue({ code: 'custom', message: `duplicate integration id ${JSON.stringify(id)}` });
        seen.add(id);
    }
});
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
/**
 * Strict JSON reader with duplicate-key, reserved-key, byte and nesting checks.
 * It builds null-prototype objects so later merge code cannot inherit authority.
 */
export function parseStrictJson(text, options = {}) {
    const label = options.label ?? 'JSON';
    const maxBytes = options.maxBytes ?? INTEGRATION_MANIFEST_MAX_BYTES;
    const maxDepth = options.maxDepth ?? INTEGRATION_MANIFEST_MAX_DEPTH;
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) {
        throw new Error(`${label} exceeds ${maxBytes} UTF-8 bytes`);
    }
    let cursor = 0;
    const fail = (message) => { throw new Error(`${label}: ${message} at byte ${cursor}`); };
    const ws = () => { while (/\s/.test(text[cursor] ?? ''))
        cursor += 1; };
    const stringToken = () => {
        if (text[cursor] !== '"')
            fail('expected string');
        const start = cursor;
        cursor += 1;
        while (cursor < text.length) {
            const ch = text[cursor];
            if (ch === '"') {
                cursor += 1;
                try {
                    return JSON.parse(text.slice(start, cursor));
                }
                catch {
                    return fail('invalid string escape');
                }
            }
            if (ch === '\\')
                cursor += 2;
            else {
                if (ch.charCodeAt(0) < 0x20)
                    fail('unescaped control character');
                cursor += 1;
            }
        }
        return fail('unterminated string');
    };
    const value = (depth) => {
        if (depth > maxDepth)
            fail(`nesting exceeds ${maxDepth}`);
        ws();
        const ch = text[cursor];
        if (ch === '"')
            return stringToken();
        if (ch === '{') {
            cursor += 1;
            ws();
            const out = Object.create(null);
            const keys = new Set();
            if (text[cursor] === '}') {
                cursor += 1;
                return out;
            }
            for (;;) {
                ws();
                const key = stringToken();
                ws();
                if (FORBIDDEN_JSON_KEYS.has(key))
                    fail(`reserved key ${JSON.stringify(key)} is forbidden`);
                if (keys.has(key))
                    fail(`duplicate key ${JSON.stringify(key)}`);
                keys.add(key);
                if (text[cursor] !== ':')
                    fail('expected colon');
                cursor += 1;
                out[key] = value(depth + 1);
                ws();
                if (text[cursor] === '}') {
                    cursor += 1;
                    return out;
                }
                if (text[cursor] !== ',')
                    fail('expected comma or object end');
                cursor += 1;
            }
        }
        if (ch === '[') {
            cursor += 1;
            ws();
            const out = [];
            if (text[cursor] === ']') {
                cursor += 1;
                return out;
            }
            for (;;) {
                out.push(value(depth + 1));
                ws();
                if (text[cursor] === ']') {
                    cursor += 1;
                    return out;
                }
                if (text[cursor] !== ',')
                    fail('expected comma or array end');
                cursor += 1;
            }
        }
        const rest = text.slice(cursor);
        const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest)?.[0];
        if (primitive === undefined)
            return fail('invalid value');
        cursor += primitive.length;
        return JSON.parse(primitive);
    };
    const parsed = value(0);
    ws();
    if (cursor !== text.length)
        fail('trailing content');
    return parsed;
}
export function parseHarnessIntegrationManifestJson(text) {
    return HarnessIntegrationManifestV1Schema.parse(parseStrictJson(text, { label: 'INTEGRATIONS.json' }));
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
        const out = Object.create(null);
        for (const key of Object.keys(value).sort()) {
            out[key] = canonicalize(value[key]);
        }
        return out;
    }
    return value;
}
/** Deterministic JSON used for consent and evidence digests. */
export function canonicalIntegrationJson(value) {
    return JSON.stringify(canonicalize(value));
}
/** Content-bound digest over the final aggregate, not merely each source file. */
export function integrationManifestDigest(manifests) {
    return `sha256:${createHash('sha256').update(canonicalIntegrationJson(manifests)).digest('hex')}`;
}
//# sourceMappingURL=integration.schema.js.map