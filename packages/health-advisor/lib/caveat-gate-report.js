'use strict';

// caveat-gate-report.js — render a GateReport as text and as JSON. Per-axis output only; there is
// deliberately NO composite field and no arithmetic over axes at this layer either (INV-9): a
// renderer that sums axes into a "friendly score" would reintroduce at the display layer exactly
// what the data layer forbids.

function renderGateReportJson(report) {
  return JSON.stringify(report, null, 2) + '\n';
}

function renderGateReportText(report) {
  const lines = [];
  lines.push(`caveat-preservation gate — verdict: ${report.verdict}`);
  lines.push('');
  for (const [name, axis] of Object.entries(report.axes)) {
    const extras = [];
    if ('material_total' in axis) extras.push(`material ${axis.material_preserved}/${axis.material_total}`, `informational ${axis.informational_preserved}/${axis.informational_total}`);
    if ('rendered_total' in axis) extras.push(`resolved ${axis.resolved_total}/${axis.rendered_total}`);
    if ('chars' in axis) extras.push(`chars ${axis.chars}`, `count ${axis.count}`);
    lines.push(`  ${name}: ${axis.status}${extras.length ? '   (' + extras.join(', ') + ')' : ''}`);
    for (const v of axis.violations) {
      lines.push(`    - ${v.code}${v.caveat_id ? ' ' + v.caveat_id : ''}${v.finding_id ? ' ' + v.finding_id : ''}${v.specialty ? ' ' + v.specialty : ''}: ${v.detail || ''}`);
    }
    if (axis.informational_violations && axis.informational_violations.length) {
      lines.push(`    (informational, reported separately — cannot fail the run, cannot hide in an average)`);
      for (const v of axis.informational_violations) lines.push(`    ~ ${v.code}${v.caveat_id ? ' ' + v.caveat_id : ''}: ${v.detail || ''}`);
    }
  }
  if (report.lane_failures.length) {
    lines.push('');
    lines.push('  failed lanes (named, never silent):');
    for (const lf of report.lane_failures) lines.push(`    - ${lf.specialty}: ${lf.reason}${lf.detail ? ' — ' + String(lf.detail).split('\n')[0] : ''}`);
  }
  if (report.inconclusive_reasons.length) {
    lines.push('');
    lines.push('  inconclusive because (inconclusive never passes):');
    for (const r of report.inconclusive_reasons) lines.push(`    - ${r}`);
  }
  lines.push('');
  lines.push('  known residual limits (printed on every report, clean or not):');
  for (const r of report.residual_limits) lines.push(`    - ${r}`);
  return lines.join('\n') + '\n';
}

module.exports = { renderGateReportJson, renderGateReportText };
