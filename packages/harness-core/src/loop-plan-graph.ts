/**
 * loop-plan-graph (idea d25a3c8a) — the COMPLETENESS leg of loop-plan/1's closed-world checking.
 *
 * What existed before this module (the round-7 cross-family reviewer's ONE not-met bar item,
 * SIGNOFF's "B-not-A reason 1"): `KNOWN_KEYS === INJECT` and the honesty test's `SCANNED` roster
 * all compare artifacts DOWNSTREAM of FIELD_DOMAINS — equality proves the rosters are consistent
 * with each other, never that they are COMPLETE against the interface source. The reviewer's
 * constructive counterexample: declare `LoopStep.extra?: ExtraPolicy`, add only the parent
 * `{t:'record'}` domain entry, and `extra: { enabeld: true }` escapes every check while every
 * equality guard stays green — "a new record kind cannot escape is unproven and demonstrably
 * false" (verbatim). The shipped mitigation was a documented four-step extension discipline — a
 * layer-4 instruction, exactly the layer the cost-of-detection ladder says such a check must not
 * live on.
 *
 * THE FIX (this module, layer 1): walk the interface graph from `LoopPlan` in the SOURCE TEXT,
 * transitively collect every reachable named interface, and let the honesty test require that the
 * reachable set is exactly the wired set. An interface reachable from LoopPlan but absent from the
 * wiring fails BY CONSTRUCTION, naming itself — no memory, no discipline, no fourth manual step.
 *
 * PURE: operates on source text handed in by the caller; no fs, no clock. That is what lets the
 * acceptance test run the reviewer's counterexample against a SABOTAGED COPY of the source and
 * require a red, while the real source stays green.
 */

/** One parsed field: its name and the DECLARED interface names its type text references. */
export interface GraphField {
  readonly field: string;
  readonly refs: readonly string[];
}

/** interface name → its fields (index signatures like `[xKey: \`x-${string}\`]` are excluded:
 * they open no named-interface edge and are the extension escape hatch by design). */
export type InterfaceGraph = ReadonlyMap<string, readonly GraphField[]>;

/** Brace-matched interface extraction. A regex-only scan truncates at the first nested brace
 * (inline object fields are everywhere in this file), so bodies are cut by depth counting. */
export function parseInterfaceGraph(source: string): InterfaceGraph {
  const names = new Set<string>();
  const headRe = /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g;
  for (let m = headRe.exec(source); m !== null; m = headRe.exec(source)) names.add(m[1]!);

  const graph = new Map<string, GraphField[]>();
  headRe.lastIndex = 0;
  for (let m = headRe.exec(source); m !== null; m = headRe.exec(source)) {
    const name = m[1]!;
    const open = source.indexOf('{', m.index + m[0].length);
    if (open === -1) continue;
    let depth = 0;
    let close = -1;
    for (let i = open; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close === -1) continue;
    const body = source.slice(open + 1, close);

    // Split the body into top-level entries at depth 0 (`;` inside an inline `{...}` must not cut).
    const entries: string[] = [];
    let entry = '';
    let d = 0;
    for (const ch of body) {
      if (ch === '{' || ch === '(' || ch === '<' || ch === '[') d += 1;
      else if (ch === '}' || ch === ')' || ch === '>' || ch === ']') d -= 1;
      if (ch === ';' && d === 0) { entries.push(entry); entry = ''; continue; }
      entry += ch;
    }
    if (entry.trim() !== '') entries.push(entry);

    const fields: GraphField[] = [];
    for (const raw of entries) {
      // strip comments, then match `readonly? name?: TYPE`
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
      if (text === '' || text.startsWith('[')) continue; // index signature — by-design escape hatch
      const fm = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??:\s*([\s\S]+)$/.exec(text);
      if (fm === null) continue;
      const typeText = fm[2]!;
      const refs = new Set<string>();
      const idRe = /[A-Za-z_$][\w$]*/g;
      for (let im = idRe.exec(typeText); im !== null; im = idRe.exec(typeText)) {
        if (names.has(im[0]) && im[0] !== name) refs.add(im[0]);
      }
      fields.push({ field: fm[1]!, refs: [...refs] });
    }
    graph.set(name, fields);
  }
  return graph;
}

/** Every interface reachable from `root` (inclusive), via any field's declared-interface refs —
 * arrays, unions and nullables all count: `LoopStep[]`, `RetryProfile | null` open the same edge. */
export function reachableInterfaces(graph: InterfaceGraph, root: string): string[] {
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name) || !graph.has(name)) continue;
    seen.add(name);
    for (const f of graph.get(name)!) for (const ref of f.refs) if (!seen.has(ref)) queue.push(ref);
  }
  return [...seen].sort();
}

export interface GraphWiringReport {
  readonly ok: boolean;
  /** Reachable from the root but NOT in the wired roster — each one is exactly the reviewer's
   * counterexample: a record kind whose key space is open while every equality guard stays green. */
  readonly unwired: string[];
  readonly reachable: string[];
  /** Wired but no longer reachable — a stale roster entry (the reverse rot). */
  readonly stale: string[];
}

/** The completeness check the equality guards could not perform: reachable(source) vs wired. */
export function checkGraphWiring(source: string, wired: readonly string[], root = 'LoopPlan'): GraphWiringReport {
  const graph = parseInterfaceGraph(source);
  const reachable = reachableInterfaces(graph, root);
  const wiredSet = new Set(wired);
  const reachableSet = new Set(reachable);
  const unwired = reachable.filter((n) => !wiredSet.has(n));
  // The wired roster (KNOWN_KEYS) legitimately mixes interface names with INLINE-record FIELD names
  // (`artifacts`, `budget`, `checkpointing`, …) — those are the inlineSubFields machinery's
  // business, not this check's. Staleness is judged only for entries that ARE declared interfaces
  // in this source: a declared-but-unreachable interface in the roster is real rot; an inline field
  // name is not an interface and must not be reported as one (caught on the first live run: five
  // false stale entries, all inline fields).
  const stale = [...wiredSet].filter((n) => graph.has(n) && !reachableSet.has(n)).sort();
  return { ok: unwired.length === 0 && stale.length === 0, unwired, reachable, stale };
}
