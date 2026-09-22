const emptyCounts = () => ({ blocker: 0, high: 0, medium: 0, low: 0, unknown: 0 });
const heading = /^#{1,6}[ \t]+/;
const findingsHeading = /^#{1,6}[ \t]*Findings(?:[ \t]+\((\d+)\))?[ \t]*$/;
const expectedTable = 'expected severity plus finding/title and location/where columns';
/** qe-findings.ts does not export maskMarkdown. This local fallback blanks fences and
 * HTML comments without moving source lines, as permitted by the TASK-1 contract. */
function maskMarkdown(text) {
    let fence = null;
    let inComment = false;
    return text.split('\n').map((line) => {
        if (fence !== null) {
            const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line)?.[1];
            if (close && close[0] === fence[0] && close.length >= fence.length)
                fence = null;
            return ' '.repeat(line.length);
        }
        let visible = '';
        for (let i = 0; i < line.length;) {
            if (inComment) {
                const end = line.indexOf('-->', i);
                if (end === -1) {
                    visible += ' '.repeat(line.length - i);
                    break;
                }
                visible += ' '.repeat(end + 3 - i);
                i = end + 3;
                inComment = false;
            }
            else {
                const start = line.indexOf('<!--', i);
                if (start === -1) {
                    visible += line.slice(i);
                    break;
                }
                visible += line.slice(i, start) + '    ';
                i = start + 4;
                inComment = true;
            }
        }
        const open = /^ {0,3}(`{3,}|~{3,})/.exec(visible)?.[1];
        if (open) {
            fence = open;
            return ' '.repeat(line.length);
        }
        return visible;
    }).join('\n');
}
function cells(line) {
    const parts = line.trim().split(/(?<!\\)\|/);
    if (parts[0] === '')
        parts.shift();
    if (parts[parts.length - 1] === '')
        parts.pop();
    return parts.map((cell) => cell.replace(/\\\|/g, '|').trim());
}
function severityOf(cell) {
    switch (cell.trim().toLowerCase()) {
        case 'blocker':
        case 'critical': return 'BLOCKER';
        case 'high':
        case 'major': return 'HIGH';
        case 'medium':
        case 'med': return 'MEDIUM';
        case 'low':
        case 'minor': return 'LOW';
        default: return 'unknown';
    }
}
/** Read only the single Findings section; malformed attempts carry an explicit reason. */
export function classifyReqeFindings(text) {
    const lines = maskMarkdown(text).split(/\r?\n/);
    const sections = lines.flatMap((line, index) => {
        const match = findingsHeading.exec(line);
        return match ? [{ index, declared: match[1] === undefined ? null : Number(match[1]) }] : [];
    });
    if (sections.length === 0)
        return { kind: 'absent' };
    if (sections.length !== 1)
        return { kind: 'rejected', reason: `ambiguous: ${sections.length} Findings headings` };
    const section = sections[0];
    let end = section.index + 1;
    while (end < lines.length && !heading.test(lines[end]))
        end++;
    let start = section.index + 1;
    while (start < end && !/(?<!\\)\|/.test(lines[start]))
        start++;
    if (start === end) {
        if (section.declared === 0) {
            return { kind: 'accepted', counts: emptyCounts(), rows: 0, declared: 0, blocking: [] };
        }
        return { kind: 'rejected', reason: `no canonical table; ${expectedTable}` };
    }
    const headers = cells(lines[start]).map((cell) => cell.toLowerCase());
    const severityIndex = headers.indexOf('severity');
    if (severityIndex === -1)
        return { kind: 'rejected', reason: `no severity column; ${expectedTable}; parsed columns: ${headers.join(', ')}` };
    if (headers.lastIndexOf('severity') !== severityIndex)
        return { kind: 'rejected', reason: 'ambiguous: multiple severity columns' };
    const titleIndex = headers.findIndex((cell) => cell === 'finding' || cell === 'title');
    const whereIndex = headers.findIndex((cell) => cell === 'location' || cell === 'where');
    if (titleIndex === -1 || whereIndex === -1)
        return { kind: 'rejected', reason: `missing finding/title or location/where column; ${expectedTable}` };
    const delimiter = start + 1 < end ? cells(lines[start + 1]) : [];
    if (delimiter.length !== headers.length || !delimiter.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        return { kind: 'rejected', reason: `row ${start + 2}: invalid delimiter; expected ${headers.length} delimiter cells for columns: ${headers.join(', ')}` };
    }
    const counts = { ...emptyCounts() };
    const blocking = [];
    let rows = 0;
    let finished = false;
    for (let index = start + 2; index < end; index++) {
        const line = lines[index];
        if (!/(?<!\\)\|/.test(line)) {
            finished = true;
            continue;
        }
        if (finished)
            return { kind: 'rejected', reason: `row ${index + 1}: ambiguous table continuation` };
        const row = cells(line);
        if (row.length !== headers.length) {
            return { kind: 'rejected', reason: `row ${index + 1}: ${row.length} cells for ${headers.length} columns (unescaped pipe?); parsed columns: ${headers.join(', ')}` };
        }
        if (row.every((cell) => /^:?-{3,}:?$/.test(cell)))
            return { kind: 'rejected', reason: `row ${index + 1}: ambiguous additional table delimiter` };
        const severity = severityOf(row[severityIndex]);
        const key = severity.toLowerCase();
        counts[key]++;
        rows++;
        if (severity === 'BLOCKER' || severity === 'HIGH') {
            const where = row[whereIndex];
            blocking.push({ severity, title: row[titleIndex], where: where === '—' || where === '' ? null : where });
        }
    }
    return { kind: 'accepted', counts, rows, declared: section.declared, blocking };
}
/** Independent pass: no classification or new-findings state participates in prior status. */
export function parsePriorFindings(text) {
    const lines = maskMarkdown(text).split(/\r?\n/);
    const sections = lines.flatMap((line, index) => /^#{1,6}[ \t]*Prior findings[ \t]*$/.test(line) ? [index] : []);
    if (sections.length !== 1)
        return { kind: 'unassessed' };
    let total = 0;
    const open = [];
    for (let index = sections[0] + 1; index < lines.length; index++) {
        const line = lines[index];
        if (heading.test(line))
            break;
        const match = /^[ \t]*(\d+):[ \t]+(closed|open)[ \t]+—[ \t]+\S.*$/.exec(line);
        if (!match)
            continue;
        total++;
        if (match[2] === 'open')
            open.push(Number(match[1]));
    }
    if (total === 0)
        return { kind: 'unassessed' };
    return open.length > 0 ? { kind: 'open', open, total } : { kind: 'closed', closed: total, total };
}
/** The only blocking rule; prior status is reported independently. */
export function buildReqeVerdict(text) {
    const findings = classifyReqeFindings(text);
    const prior = parsePriorFindings(text);
    const accepted = findings.kind === 'accepted';
    const counts = accepted ? findings.counts : emptyCounts();
    return {
        new: accepted ? (counts.blocker >= 1 || counts.high >= 1 ? 'blocked' : 'ready') : 'unassessed',
        prior, findings, counts,
        rows: accepted ? findings.rows : 0,
        blocking: accepted ? findings.blocking : [],
        source: 'reviewer-declared',
    };
}
//# sourceMappingURL=reqe-verdict.js.map