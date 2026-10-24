/** Raw-text trailing declaration grammar. Path authority is a separate layer. */
export function parseExpectedTargetBlock(text) {
  const lines = String(text || '').split('\n');
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^EXPECTED_CODE_TARGETS:[ \t]*\r?$/.exec(lines[i]);
    if (match && match[0] === lines[i]) markers.push(i);
  }
  const startLine = markers.length ? markers[0] : -1;
  if (markers.length !== 1) return { ok: false, targets: [], startLine, reason: 'target-block-missing-or-duplicate' };
  if (lines.slice(startLine).some(line => line.includes('\r'))) return { ok: false, targets: [], startLine, reason: 'target-block-malformed' };
  const targets = [];
  for (const line of lines.slice(startLine + 1)) {
    if (!line.trim()) continue;
    const match = /^- (.+)$/.exec(line);
    // Full-line equality also refuses a final U+2028/U+2029 that $ can match before.
    if (!match || match[0] !== line) return { ok: false, targets: [], startLine, reason: 'target-block-malformed' };
    targets.push(match[1]);
  }
  if (!targets.length) return { ok: false, targets: [], startLine, reason: 'target-block-empty' };
  return { ok: true, targets, startLine };
}
