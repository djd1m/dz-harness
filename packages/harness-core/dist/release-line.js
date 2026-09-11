export const RELEASE_LINE_RE = /`harness-core v(\d+\.\d+\.\d+)` · `harness-cli v(\d+\.\d+\.\d+)`/;
export function findReleaseLine(text) {
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const match = RELEASE_LINE_RE.exec(line);
        if (match?.[1] !== undefined && match[2] !== undefined) {
            return { index, line, core: match[1], cli: match[2] };
        }
    }
    return null;
}
export function rewriteReleaseLine(text, core, cli) {
    const found = findReleaseLine(text);
    if (found === null)
        return null;
    const lines = text.split('\n');
    lines[found.index] = found.line.replace(RELEASE_LINE_RE, `\`harness-core v${core}\` · \`harness-cli v${cli}\``);
    return lines.join('\n');
}
//# sourceMappingURL=release-line.js.map