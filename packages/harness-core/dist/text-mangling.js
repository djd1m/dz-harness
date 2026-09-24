const TEACH_MIN_CHARS = 40;
const BACKLOG_MIN_CHARS = 20;
export function detectMangledText(text, kind) {
    // Literal backticks and $( are NOT symptoms: the shell left those characters intact.
    const symptoms = [];
    const add = (kind, at) => {
        symptoms.push({ kind, at, excerpt: text.slice(at, at + 40) });
    };
    const holes = /(?<=\S) {2,}(?=\S)|(?<=\S) +(?=[.,)»;:])/g;
    const arrows = /(?:→|->)[\s\p{P}]*?(?=[.!?。！？]|$)/gu;
    const brackets = /\(\s*\)|\[\s*\]|\{\s*\}|«\s*»|"\s*"|'\s*'/g;
    for (const match of text.matchAll(holes))
        add('empty-substitution-hole', match.index);
    for (const match of text.matchAll(arrows))
        add('dangling-arrow', match.index);
    for (const match of text.matchAll(brackets))
        add('empty-brackets', match.index);
    if (text.trim().length < (kind === 'teach' ? TEACH_MIN_CHARS : BACKLOG_MIN_CHARS)) {
        add('short-for-kind', 0);
    }
    return symptoms.sort((a, b) => a.at - b.at);
}
//# sourceMappingURL=text-mangling.js.map