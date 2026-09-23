/** Compare relative-path → SHA-256 maps without reading or changing either tree. */
export function compareTrees(source, target) {
    const states = new Map();
    for (const [path, hash] of source) {
        states.set(path, !target.has(path) ? 'missing' : target.get(path) === hash ? 'match' : 'diverged');
    }
    for (const path of target.keys()) {
        if (!source.has(path))
            states.set(path, 'extra');
    }
    return states;
}
//# sourceMappingURL=tree-sync.js.map