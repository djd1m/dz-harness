/** Observer-only framing. Full rendered bytes, never a lesson marker alone, prove retention. */
import { createHash, randomBytes } from 'node:crypto';
import { renderHookContext } from './recall-hook-policy.js';
export const CODEX_RECALL_FRAME_MAX_BYTES = 262_144;
export const CODEX_RECALL_FRAME_MAX_ITEMS = 16;
export const CODEX_RECALL_OBSERVER_NONCE_ENV = 'DZ_CODEX_RECALL_OBSERVER_NONCE';
const OPAQUE = /^[a-f0-9]{32}$/u;
const LESSON = /^teach:[a-f0-9]{16}$/u;
export const codexRecallDigest = (text) => createHash('sha256').update(text).digest('hex');
export const isCodexRecallAlias = (value) => typeof value === 'string' && OPAQUE.test(value);
/** Invalid opt-in never changes the ordinary hook's behavior. Duplicate IDs are not addressable. */
export function renderCodexRecallFrame(selection, nonce, eventId) {
    const ordinary = renderHookContext(selection);
    if (!isCodexRecallAlias(nonce) || ordinary === '' || selection.hits.length > CODEX_RECALL_FRAME_MAX_ITEMS)
        return ordinary;
    const invocation = isCodexRecallAlias(eventId) ? eventId : randomBytes(16).toString('hex');
    let text = `DZ-RECALL/1 ${nonce} ${invocation} ${selection.hits.length}\n`;
    // Render each lesson through the existing formatter. Length framing handles arbitrary delimiters
    // and multibyte text inside an untrusted lesson without interpreting either as control data.
    for (const hit of selection.hits) {
        const body = renderHookContext({ ...selection, hits: [hit] });
        const id = typeof hit.dzId === 'string' && LESSON.test(hit.dzId) ? hit.dzId : '-';
        text += `DZ-SEGMENT/1 ${id} ${Buffer.byteLength(body)} ${codexRecallDigest(body)}\n${body}\nDZ-END-SEGMENT/1\n`;
        if (Buffer.byteLength(text) > CODEX_RECALL_FRAME_MAX_BYTES)
            return ordinary;
    }
    return `${text}DZ-END-RECALL/1 ${invocation}`;
}
/** Only the complete, native own-hook output is parsed; spill previews are matched against it. */
export function parseCodexRecallFrame(context, nonce) {
    if (typeof context !== 'string' || !isCodexRecallAlias(nonce) || Buffer.byteLength(context) > CODEX_RECALL_FRAME_MAX_BYTES)
        return undefined;
    const buffer = Buffer.from(context);
    let position = 0;
    const line = () => {
        const end = buffer.indexOf(10, position);
        if (end < position || end - position > 256)
            return undefined;
        const value = buffer.subarray(position, end).toString('utf8');
        position = end + 1;
        return value;
    };
    const header = /^DZ-RECALL\/1 ([a-f0-9]{32}) ([a-f0-9]{32}) (\d{1,2})$/u.exec(line() ?? '');
    if (header === null || header[1] !== nonce)
        return undefined;
    const count = Number(header[3]);
    if (count < 1 || count > CODEX_RECALL_FRAME_MAX_ITEMS)
        return undefined;
    const segments = [];
    const ids = new Set();
    for (let i = 0; i < count; i++) {
        const start = position;
        const meta = /^DZ-SEGMENT\/1 (teach:[a-f0-9]{16}|-) ([1-9]\d{0,5}) ([a-f0-9]{64})$/u.exec(line() ?? '');
        if (meta === null)
            return undefined;
        const size = Number(meta[2]);
        if (size > CODEX_RECALL_FRAME_MAX_BYTES || position + size > buffer.length)
            return undefined;
        const body = buffer.subarray(position, position + size);
        const bodyText = body.toString('utf8');
        if (!Buffer.from(bodyText).equals(body) || codexRecallDigest(bodyText) !== meta[3])
            return undefined;
        position += size;
        if (buffer[position++] !== 10 || line() !== 'DZ-END-SEGMENT/1')
            return undefined;
        const id = meta[1];
        if (id !== '-' && ids.has(id))
            return undefined;
        if (id !== '-')
            ids.add(id);
        segments.push({ ...(id === '-' ? {} : { id }), bytes: buffer.subarray(start, position).toString('utf8'), digest: meta[3] });
    }
    if (buffer.subarray(position).toString('utf8') !== `DZ-END-RECALL/1 ${header[2]}`)
        return undefined;
    return { eventId: header[2], context, segments };
}
//# sourceMappingURL=codex-recall-frame.js.map