/**
 * The backend cascade — probe optional backends, fall back gracefully.
 *
 * Heavier backends (a vector / embedding store, `agentdb`, `sql.js`) can be
 * registered as probes. If none initialises, a guaranteed fallback is used.
 * This keeps such backends *optional* — never a hard dependency.
 *
 * @packageDocumentation
 */
/**
 * Walk `probes` in order; return the first backend that initialises. If every
 * probe is unavailable (returns `undefined` or throws), return `fallback`.
 */
export async function selectBackend(probes, fallback) {
    const tried = [];
    for (const probe of probes) {
        tried.push(probe.name);
        try {
            const backend = await probe.create();
            if (backend !== undefined) {
                return { backend, selected: probe.name, tried };
            }
        }
        catch {
            // probe unavailable — fall through to the next
        }
    }
    return { backend: fallback, selected: fallback.name, tried };
}
//# sourceMappingURL=cascade.js.map