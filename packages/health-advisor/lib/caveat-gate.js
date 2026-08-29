'use strict';

// caveat-gate.js — the caveat-preservation gate: a PURE function
//   evaluateCaveatGate({ laneSources, synthesisText }) → GateReport
// No I/O anywhere in this module — fixtures drive it, the CLI does the filesystem (architecture
// §1.1). Implements steps A–K of architecture §3.3.
//
// THE LOAD-BEARING DESIGN CHOICE (step D): caveat↔claim attachment is DECLARED DATA on both sides
// (source: applies_to; rendered: the applies-to attribute), so preservation is checked by SET
// EQUALITY on the linkage — never a ±character proximity window (windows are exactly what produced
// the 484-finding noise in dz claim-check; .claude/rules/feature-adr-conventions.md). A caveat
// whose text is present VERBATIM but attached to the wrong claim is a MISS, not a hit (INV-5).
//
// THE PRECISION RULE (step E, G6/AM-5): every rendered caveat must resolve to a source caveat_id.
// Fabricating caveats can never raise recall — recall's denominator and numerator are computed from
// SOURCE linkages only — and each fabrication is individually flagged. Recall and precision are two
// separate axes; they are NEVER averaged into a composite (INV-9): the verdict is the lattice meet
// PASS ≺ INCONCLUSIVE ≺ FAIL over all axes.

const { laneFromContent, laneFailure, linkageTokens, SEVERITIES } = require('./consult-finding-schema.js');
const { lexAnchors } = require('./consult-anchors.js');

const UNGATED_LABEL = 'этот раздел написан моделью и НЕ проверяется гейтом';

// G4 (QE round 2): caveat TYPES whose loss is ALWAYS material, regardless of the lane's own
// severity_if_dropped label. severity_if_dropped is DECLARED BY THE EMITTER the gate audits — a
// verdict conditioned on it alone is disarmable by that emitter (one free, id-stable relabel).
// The gate derives materiality from EVIDENCE (the caveat's type), never solely from the claim
// under test. The pinned set mirrors the safety-load-bearing floor types.
// Round 3 (Codex re-QE R3): + contraindication_scope (retyping a contraindication down "can permit
// clinically unsafe interpretation or action") and measurement_context ("fasting only" — dropping
// it can reverse a numeric lab verdict). Both are floor types since round 3.
// Backlog 99001331: + conditions_unknown (the preanalytical-guard's core output — dropping it reads
// a lab value as if sampling conditions were verified; the guard exists because unknown conditions
// can REVERSE a numeric verdict), study_population (dropping it over-generalizes a result to a
// patient it may not apply to) and source_disclaimer (dropping it inflates a finding's authority).
// Same pinning criterion as round 3: each loss can permit clinically unsafe interpretation.
const MATERIAL_PINNED_TYPES = Object.freeze(['FRESHNESS_UNKNOWN', 'GRADE', 'dose_scope', 'population_scope', 'contraindication_scope', 'measurement_context', 'conditions_unknown', 'study_population', 'source_disclaimer']);
const REASON_CODE_RE = /^(duplicate_of:\S+|superseded_by:\S+|out_of_scope_of_complaint|lane_failed)$/;
const FINDING_ID_RE = /[a-z][a-z-]*:[0-9a-f]{12}/g;

// Named residual holes — printed in EVERY report footer, clean or not (architecture §8).
const RESIDUAL_LIMITS = Object.freeze([
  'distributed-pattern blind spot: a dangerous pattern split across individually low-severity claims can pass — the gate proves claim-store integrity, NOT clinical completeness',
  'the emergency triage table is closed-world: what is not in its 12 rows cannot fire',
  'the single ungated section retains framing freedom inside its label',
  'parallel lanes may share one underlying model — blind ≠ independent (correlated errors possible)',
  'the material/informational split: only MATERIAL caveat losses move the verdict; informational losses are reported (informational_violations) but do not block — mitigated by the pinned always-material types (FRESHNESS_UNKNOWN, GRADE, dose_scope, population_scope, contraindication_scope, measurement_context, conditions_unknown, study_population, source_disclaimer), which the emitting lane cannot relabel down, and by the id-pinning rule (a caveat_id EVER seen with a pinned type in this run stays material; reappearing unpinned is a CAVEAT_RETYPED violation)',
  'the caveat TYPE at FIRST emission is still emitter-declared: a specialist that mislabels a contraindication as an unpinned type — or buries it in free-text prose — from the very first lane version evades the pinned set; the id-pinning rule catches RETYPING after first sight, not semantic mislabeling at the source (no machine check can prove a type matches a caveat’s meaning)',
  'run binding (--run-id) proves run IDENTITY, not authenticity: a lane file forged inside the SAME run with the correct run_id is indistinguishable from a real lane — the run_id is not a secret and there is no cryptographic lane integrity',
  'the cross-attempt pin carry lives in the --report file on an honest filesystem: a schema-invalid report is a loud enforce error, but a report DELETED between attempts is indistinguishable from a first attempt — pins reset undetectably (and shadow runs never enforce any of the run-binding or report requirements at all)',
]);

function meetVerdict(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('INCONCLUSIVE')) return 'INCONCLUSIVE';
  return 'PASS';
}

function severityAtLeast(sev, floor) { return SEVERITIES.indexOf(sev) >= SEVERITIES.indexOf(floor); }

/** Strip HTML-comment spans (anchor markup) plus the given [start,end) spans from a text slice. */
function scrubbedText(text, sliceStart, sliceEnd, excludeSpans) {
  let out = '';
  for (let i = sliceStart; i < sliceEnd; i++) {
    if (excludeSpans.some(([a, b]) => i >= a && i < b)) continue;
    out += text[i];
  }
  return out.replace(/<!--[\s\S]*?-->/g, ' ');
}

function findBareNumerals(scrubbed) {
  const hits = [];
  const re = /\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(scrubbed)) !== null) {
    const ctx = scrubbed.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).replace(/\s+/g, ' ').trim();
    hits.push({ numeral: m[0], context: ctx });
  }
  return hits;
}

function evaluateCaveatGate({ laneSources, synthesisText, expectedLanes, expectedRunId, pinnedCaveatIds }) {
  // ── A/B. load lanes; ids are RECOMPUTED inside validateFindings (mismatch → id_not_derivable) ──
  // Round 3: expectedRunId (when given) binds every lane file to the run under audit — a lane
  // whose lane.run_id differs (or is absent) becomes laneFailure(run_mismatch), never data.
  const sets = [];
  const laneFailures = [];
  for (const src of laneSources || []) {
    const result = laneFromContent(src.specialty, src.raw, expectedRunId != null ? { expectedRunId } : {});
    if (result.kind === 'set') sets.push(result.set);
    else laneFailures.push(result);
  }
  // G3 (QE round 2): an EXPECTED lane that wrote nothing is a NAMED failed specialist, not an
  // absence. Without a roster the gate audits only what readdir found — a dead lane silently
  // vanishes and the 'missing' reason of the closed taxonomy is unreachable. With expectedLanes,
  // every expected specialty that produced no lane source becomes laneFailure(s, 'missing') and
  // step I requires the synthesis to DISCLOSE it (INV-6/AM-6 for the ABSENT-artifact case).
  const presentSpecialties = new Set((laneSources || []).map((src) => String(src.specialty)));
  for (const expected of expectedLanes || []) {
    const s = String(expected);
    if (!presentSpecialties.has(s) && !laneFailures.some((lf) => lf.specialty === s)) {
      laneFailures.push(laneFailure(s, 'missing', 'expected lane produced no findings file'));
    }
  }

  // ── C. lex ────────────────────────────────────────────────────────────────────────────────
  const tree = lexAnchors(String(synthesisText == null ? '' : synthesisText));

  const sourceFindings = new Map(); // finding_id → {finding, specialty}
  const sourceCaveats = new Map(); // caveat_id → {caveat, finding, specialty}
  for (const set of sets) {
    for (const f of set.findings) {
      sourceFindings.set(f.finding_id, { finding: f, specialty: set.specialty });
      for (const c of f.caveats) sourceCaveats.set(c.caveat_id, { caveat: c, finding: f, specialty: set.specialty });
    }
  }

  const renderedFindings = new Map(); // finding_id → anchor
  for (const fa of tree.findings) if (fa.id) renderedFindings.set(fa.id, fa);

  // ── D0. ID-PINNING (round 3, Codex re-QE R3: the same-ID retyping bypass) ─────────────────
  // caveat_id survives retyping (type is part of NO id), so a caveat first seen with a pinned
  // type could be re-emitted under an allowed unpinned type and its omission became non-blocking.
  // Rule, CONTENT-INDEPENDENT: once a caveat_id has EVER been seen with a pinned type in this
  // run (carried in via pinnedCaveatIds — the CLI feeds back the previous gate report of the same
  // run — or seen in the current lane files), that id IS material, whatever its current type
  // claims. An id carried as pinned that appears now with an unpinned type is itself a violation
  // (CAVEAT_RETYPED), even if its text survived — the retype is the attack, not the omission.
  const carriedPins = new Set((pinnedCaveatIds || []).map(String));
  const currentPins = new Set();
  for (const [caveatId, { caveat }] of sourceCaveats) {
    if (MATERIAL_PINNED_TYPES.includes(caveat.type)) currentPins.add(caveatId);
  }
  const pinnedIds = new Set([...carriedPins, ...currentPins]);

  // The THREE-SOURCE materiality predicate, defined ONCE (backlog d41fc3f9). A caveat is material
  // if its emitter labelled it so, OR its TYPE is pinned (un-relabelable by the emitter), OR its id
  // was EVER pinned in this run. It is used at BOTH sites that decide whether a lost caveat blocks —
  // the transcluded-finding recall path AND the ungated-citation path (step J). They diverged once:
  // the ungated path checked severity_if_dropped alone, so a pinned-type caveat relabelled
  // informational escaped the pin when a claim was cited only in the free-text section. One
  // predicate, one place, keeps the "un-relabelable floor" promise true on every path.
  const isMaterialCaveat = (caveat) =>
    caveat.severity_if_dropped === 'material' ||
    MATERIAL_PINNED_TYPES.includes(caveat.type) ||
    pinnedIds.has(caveat.caveat_id);

  // ── D. LINKAGE RECALL — set equality on applies_to, never a window ────────────────────────
  const recallViolations = [];
  const recallInformational = [];
  for (const [caveatId, { caveat, specialty }] of sourceCaveats) {
    if (carriedPins.has(caveatId) && !MATERIAL_PINNED_TYPES.includes(caveat.type)) {
      recallViolations.push({
        code: 'CAVEAT_RETYPED', caveat_id: caveatId, specialty, current_type: caveat.type,
        detail: 'this caveat_id was seen with a PINNED type earlier in this run and now carries an unpinned type — materiality cannot be lowered by re-emission (id-pinning rule, round 3)',
      });
    }
  }
  let materialTotal = 0;
  let materialPreserved = 0;
  let informationalTotal = 0;
  let informationalPreserved = 0;

  const allRenderedCaveats = [];
  for (const fa of tree.findings) for (const ca of fa.caveats) allRenderedCaveats.push({ anchor: ca, hostFindingId: fa.id });
  for (const ua of tree.ungated) for (const ca of ua.caveats) allRenderedCaveats.push({ anchor: ca, hostFindingId: null, ungated: true });

  for (const [findingId, { finding }] of sourceFindings) {
    const rendered = renderedFindings.get(findingId);
    if (!rendered) continue; // not transcluded — coverage (step G) owns that
    for (const caveat of finding.caveats) {
      // G4: pinned types are material BY TYPE — the emitter's own severity_if_dropped label
      // cannot relabel them down (a writer-declared field must not disarm the gate's linkage check).
      // Round 3: an id EVER pinned in this run stays material regardless of any retype (pinnedIds).
      const material = isMaterialCaveat(caveat);
      if (material) materialTotal += 1; else informationalTotal += 1;
      const bucket = material ? recallViolations : recallInformational;

      const underSame = rendered.caveats.find((ca) => ca.id === caveat.caveat_id);
      if (!underSame) {
        const elsewhere = allRenderedCaveats.find((rc) => rc.anchor.id === caveat.caveat_id && !rc.ungated);
        if (elsewhere) {
          bucket.push({ code: 'MISLINKED_CAVEAT', caveat_id: caveat.caveat_id, expected_finding: findingId, rendered_under: elsewhere.hostFindingId, detail: 'caveat rendered under a DIFFERENT finding — a recall miss (its id still resolves to a source caveat, so precision is untouched; text presence proves nothing, INV-5)' });
        } else {
          bucket.push({ code: 'MISSING_CAVEAT', caveat_id: caveat.caveat_id, finding_id: findingId, detail: 'source caveat has no rendered anchor under its finding' });
        }
        continue;
      }
      const sourceTokens = linkageTokens(caveat.applies_to);
      const renderedTokens = underSame.appliesTo;
      const setsEqual = sourceTokens.length === renderedTokens.length && sourceTokens.every((t, i) => t === renderedTokens[i]);
      if (!setsEqual) {
        const narrowed = renderedTokens.every((t) => sourceTokens.includes(t)) && renderedTokens.length < sourceTokens.length;
        bucket.push({ code: 'LINKAGE_NARROWED', caveat_id: caveat.caveat_id, source_applies_to: sourceTokens, rendered_applies_to: renderedTokens, detail: narrowed ? 'text present, attachment lost — the applies-to set was narrowed (B4’s exact case)' : 'rendered applies-to set does not equal the declared source set' });
        continue;
      }
      if (underSame.text.trim() !== caveat.text.trim()) {
        bucket.push({ code: 'CAVEAT_PARAPHRASED', caveat_id: caveat.caveat_id, detail: 'rendered caveat text is not byte-equal to the source text' });
        continue;
      }
      if (material) materialPreserved += 1; else informationalPreserved += 1;
    }
  }

  // ── E. CAVEAT PRECISION — every rendered caveat must resolve; fabrication cannot help ─────
  const precisionViolations = [];
  let renderedTotal = 0;
  let resolvedTotal = 0;
  for (const rc of allRenderedCaveats) {
    renderedTotal += 1;
    if (rc.anchor.id && sourceCaveats.has(rc.anchor.id)) resolvedTotal += 1;
    else precisionViolations.push({ code: 'FABRICATED_CAVEAT', caveat_id: rc.anchor.id || '(no id)', detail: 'rendered caveat resolves to NO source caveat_id — manufacturing caveats cannot improve any axis and strictly worsens this one' });
  }
  for (const oc of tree.orphanCaveats) {
    renderedTotal += 1;
    precisionViolations.push({ code: 'ORPHAN_CAVEAT', caveat_id: oc.id || '(no id)', detail: 'ha:caveat outside any ha:finding — a precision violation, never silently ignored' });
  }

  // ── F. VALUE BYTE-MATCH — value AND unit as separate fields; no normalisation, no rounding ─
  const valueViolations = [];
  for (const fa of tree.findings) {
    const source = fa.id ? sourceFindings.get(fa.id) : null;
    for (const va of fa.values) {
      const qvs = source ? source.finding.quoted_values || [] : [];
      const match = qvs.find((qv) => qv.ref === va.ref);
      if (!match) {
        valueViolations.push({ code: 'VALUE_MISMATCH', finding_id: fa.id, ref: va.ref, detail: 'ha:value ref resolves to no source quoted_value' });
        continue;
      }
      if (match.value !== va.value || match.unit !== va.unit) {
        valueViolations.push({ code: 'VALUE_MISMATCH', finding_id: fa.id, ref: va.ref, source: `${match.value} ${match.unit}`, rendered: `${va.value} ${va.unit}`, detail: 'value/unit must BYTE-match the source — no paraphrase, no rounding' });
      }
    }
    // Transclusion is VERBATIM: every source quoted_value of a transcluded finding must be
    // rendered as an ha:value anchor. Dropping the anchor and paraphrasing the number into prose
    // («4.9 ммоль/л» → «слегка повышен») is a byte-match violation, not a stylistic choice.
    if (source) {
      for (const qv of source.finding.quoted_values || []) {
        if (!fa.values.some((va) => va.ref === qv.ref)) {
          valueViolations.push({ code: 'MISSING_VALUE', finding_id: fa.id, ref: qv.ref, source: `${qv.value} ${qv.unit}`, detail: 'source quoted_value has no rendered ha:value anchor in its transcluded finding — a paraphrased or dropped number is a miss' });
        }
      }
    }
    // bare numerals inside the transclusion block, outside ha:value / ha:caveat inner text
    const exclude = [
      ...fa.values.map((v) => [v.contentStart, v.contentEnd]),
      ...fa.caveats.map((c) => [c.contentStart, c.contentEnd]),
    ];
    const scrubbed = scrubbedText(String(synthesisText), fa.contentStart, fa.contentEnd, exclude);
    for (const hit of findBareNumerals(scrubbed)) {
      valueViolations.push({ code: 'UNANCHORED_NUMBER', finding_id: fa.id, numeral: hit.numeral, context: hit.context, detail: 'a bare numeral outside an ha:value anchor — числа перечитывать, а не пересказывать, made mechanical' });
    }
  }

  // ── G. COVERAGE — severity ≥ moderate: transcluded, or in "Не перенесено" with an ENUM code ─
  const coverageViolations = [];
  const notCarriedById = new Map(tree.notCarried.map((nc) => [nc.id, nc]));
  for (const [findingId, { finding, specialty }] of sourceFindings) {
    if (!severityAtLeast(finding.severity, 'moderate')) continue;
    if (renderedFindings.has(findingId)) continue;
    const nc = notCarriedById.get(findingId);
    if (!nc) {
      coverageViolations.push({ code: 'MISSING_COVERAGE', finding_id: findingId, specialty, severity: finding.severity, detail: 'severity ≥ moderate finding is neither transcluded nor listed in «Не перенесено»' });
      continue;
    }
    if (!nc.reason || !REASON_CODE_RE.test(nc.reason)) {
      coverageViolations.push({ code: 'INVALID_REASON_CODE', finding_id: findingId, reason: nc.reason, detail: 'reason must be an ENUM code (duplicate_of:<id> | superseded_by:<id> | out_of_scope_of_complaint | lane_failed); free text may only APPEND in note (INV-8)' });
    }
  }

  // ── H. PROVENANCE — no ASSERTED anywhere in rendered output ───────────────────────────────
  const provenanceViolations = [];
  const outsideFences = scrubbedText(String(synthesisText), 0, String(synthesisText).length, tree.fencedSpans);
  if (/\bASSERTED\b/.test(outsideFences)) {
    provenanceViolations.push({ code: 'ASSERTED_PROVENANCE', detail: 'the rendered output claims ASSERTED provenance — the synthesis may not launder an unverified assertion' });
  }

  // ── I. LANE INTEGRITY — every LaneFailure has a ha:lane-failed notice ─────────────────────
  const laneIntegrityViolations = [];
  for (const lf of laneFailures) {
    const disclosed = tree.laneFailedNotices.some((n) => n.specialty === lf.specialty);
    if (!disclosed) {
      laneIntegrityViolations.push({ code: 'UNDISCLOSED_LANE_FAILURE', specialty: lf.specialty, reason: lf.reason, detail: 'a failed lane MUST be disclosed in the document — a silently missing specialty reads as a complete consult (INV-6/AM-6)' });
    }
  }

  // ── J. UNGATED SECTION — exactly one; labeled; cited claims carry their caveats; no numerals ─
  const ungatedViolations = [];
  const ungatedCount = tree.ungated.length;
  let ungatedChars = 0;
  if (ungatedCount !== 1) {
    ungatedViolations.push({ code: ungatedCount === 0 ? 'MISSING_UNGATED_SECTION' : 'MULTIPLE_UNGATED_SECTIONS', count: ungatedCount, detail: 'exactly ONE labeled free-text section is the contract — N sections is a structural loophole, zero means the honest surface is missing' });
  }
  for (const ua of tree.ungated) {
    ungatedChars += ua.text.length;
    if (!ua.text.includes(UNGATED_LABEL)) {
      ungatedViolations.push({ code: 'UNGATED_LABEL_MISSING', detail: `the section must open with the visible honesty label «${UNGATED_LABEL}»` });
    }
    // AM-2: any claim id cited in this section still carries that claim's MATERIAL caveats inline.
    const cited = new Set((ua.text.match(FINDING_ID_RE) || []).filter((id) => sourceFindings.has(id)));
    for (const findingId of cited) {
      const { finding } = sourceFindings.get(findingId);
      for (const caveat of finding.caveats) {
        // d41fc3f9: the SAME materiality predicate as the transcluded path — a pinned-type caveat
        // relabelled informational no longer escapes the pin just because the claim was cited only
        // in the ungated free-text section.
        if (!isMaterialCaveat(caveat)) continue;
        const carried = ua.caveats.some((ca) => ca.id === caveat.caveat_id);
        if (!carried) {
          ungatedViolations.push({ code: 'UNGATED_CITATION_MISSING_CAVEATS', finding_id: findingId, caveat_id: caveat.caveat_id, detail: 'the linkage rule extends to in-text citations: a cited claim rides WITH its caveats or not at all (AM-2)' });
        }
      }
    }
    const exclude = ua.caveats.map((c) => [c.contentStart, c.contentEnd]);
    const scrubbed = scrubbedText(String(synthesisText), ua.contentStart, ua.contentEnd, exclude)
      .replace(FINDING_ID_RE, ' '); // cited ids contain hex digits; the id itself is not a numeral claim
    for (const hit of findBareNumerals(scrubbed)) {
      ungatedViolations.push({ code: 'UNANCHORED_NUMBER', numeral: hit.numeral, context: hit.context, detail: 'no unanchored numerals inside the ungated section either' });
    }
  }

  // ── K. VERDICT — lattice meet, never an average ───────────────────────────────────────────
  const inconclusiveReasons = [];
  if (tree.inconclusive) inconclusiveReasons.push('anchor lexing inconclusive: ' + tree.errors.map((e) => e.code + (e.anchor ? `(${e.anchor})` : '')).join(', '));
  if (tree.findings.length === 0 && tree.ungated.length === 0) inconclusiveReasons.push('no ha: anchors found at all — nothing to evaluate is not a pass');
  if (sets.length === 0) inconclusiveReasons.push('no lane produced a valid finding set — an assembly of nothing cannot be evaluated');

  const axes = {
    linkage_recall: {
      status: recallViolations.length ? 'FAIL' : 'PASS',
      violations: recallViolations,
      informational_violations: recallInformational,
      material_total: materialTotal,
      material_preserved: materialPreserved,
      informational_total: informationalTotal,
      informational_preserved: informationalPreserved,
    },
    caveat_precision: { status: precisionViolations.length ? 'FAIL' : 'PASS', violations: precisionViolations, rendered_total: renderedTotal, resolved_total: resolvedTotal },
    value_byte_match: { status: valueViolations.length ? 'FAIL' : 'PASS', violations: valueViolations },
    coverage: { status: coverageViolations.length ? 'FAIL' : 'PASS', violations: coverageViolations },
    provenance: { status: provenanceViolations.length ? 'FAIL' : 'PASS', violations: provenanceViolations },
    lane_integrity: { status: laneIntegrityViolations.length ? 'FAIL' : 'PASS', violations: laneIntegrityViolations },
    ungated_section: { status: ungatedViolations.length ? 'FAIL' : 'PASS', violations: ungatedViolations, count: ungatedCount, chars: ungatedChars },
  };
  const statuses = Object.values(axes).map((a) => a.status);
  if (inconclusiveReasons.length) statuses.push('INCONCLUSIVE');

  // CANNOT-EVALUATE dominates: with no anchors at all (or no valid lane set at all) the axis FAILs
  // above are artifacts of an audit that never meaningfully ran — reporting them as a FAIL verdict
  // would let a caller "fix" a non-run by deleting inputs. INCONCLUSIVE, and inconclusive never
  // passes (enforce exit 3).
  const cannotEvaluate = (tree.findings.length === 0 && tree.ungated.length === 0) || sets.length === 0;

  return {
    schema: 'ha-gate-report-1',
    verdict: cannotEvaluate ? 'INCONCLUSIVE' : meetVerdict(statuses),
    axes,
    lane_failures: laneFailures,
    inconclusive_reasons: inconclusiveReasons,
    // Round 3: the monotone pin set of this run — carried-in pins ∪ ids currently seen with a
    // pinned type. The CLI feeds this back on the next gate run of the SAME run directory, which
    // is what makes the id-pinning rule survive re-renders (pins never wash out within a run).
    pinned_caveat_ids: [...pinnedIds].sort(),
    residual_limits: [...RESIDUAL_LIMITS],
  };
}

module.exports = { evaluateCaveatGate, UNGATED_LABEL, RESIDUAL_LIMITS, MATERIAL_PINNED_TYPES, meetVerdict };
