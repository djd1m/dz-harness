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
/** Brace-matched interface extraction. A regex-only scan truncates at the first nested brace
 * (inline object fields are everywhere in this file), so bodies are cut by depth counting. */
/**
 * Убрать из текста КОММЕНТАРИИ и СОДЕРЖИМОЕ строковых литералов, сохранив длину и переводы строк.
 *
 * ЗАЧЕМ, с воспроизведёнными случаями (ИЗМЕРЕНО 2026-09-04, бэклог f23e97dc). Разбор считал скобки
 * и точки с запятой по СЫРОМУ тексту, и четыре конструкции давали ТИХО НЕВЕРНЫЙ граф — а граф
 * решает, достижим ли интерфейс, то есть живой он или мёртвый:
 *
 *   • `interface X { note: "смотри Y"; }` — упоминание Y ВНУТРИ строки становилось НАСТОЯЩИМ
 *     ребром. Мёртвый интерфейс выглядел живым: ложно-зелёное в проверке достижимости.
 *   • `interface X { note: "a; ref: Y"; }` — точка с запятой внутри строки резала запись, и
 *     появлялось призрачное поле `ref` со своим ребром.
 *   • `interface X { // закрывает } раньше\n ref: Y; }` — закрывающая скобка в комментарии
 *     обрезала тело, и настоящее ребро ТЕРЯЛОСЬ: живой интерфейс выглядел мёртвым.
 *   • `interface X { kind: "{"; ref: Y; }` — открывающая скобка в строке раздувала тело так, что
 *     интерфейс вовсе исчезал из графа.
 *
 * ДЛИНА СОХРАНЯЕТСЯ НАМЕРЕННО: разбор ниже работает индексами по этому же тексту, и замена на
 * строку другой длины сдвинула бы каждую последующую позицию. Переводы строк сохраняются, чтобы
 * номера строк оставались верными, если их когда-нибудь понадобится сообщить.
 */
function stripCommentsAndStrings(source) {
    const out = source.split('');
    const blank = (from, to) => {
        for (let i = from; i < to && i < out.length; i += 1) {
            if (out[i] !== '\n')
                out[i] = ' ';
        }
    };
    let i = 0;
    while (i < source.length) {
        const two = source.slice(i, i + 2);
        if (two === '//') {
            const end = source.indexOf('\n', i);
            blank(i, end === -1 ? source.length : end);
            i = end === -1 ? source.length : end;
            continue;
        }
        if (two === '/*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end === -1 ? source.length : end + 2;
            blank(i, stop);
            i = stop;
            continue;
        }
        const ch = source[i];
        if (ch === '"' || ch === "'" || ch === '`') {
            let j = i + 1;
            while (j < source.length) {
                if (source[j] === '\\') {
                    j += 2;
                    continue;
                } // экранированный символ не закрывает строку
                if (source[j] === ch)
                    break;
                j += 1;
            }
            // Гасится СОДЕРЖИМОЕ, а кавычки остаются: тип `"a" | "b"` обязан выглядеть как тип, а не
            // как склеенное слово.
            blank(i + 1, Math.min(j, source.length));
            i = Math.min(j + 1, source.length);
            continue;
        }
        i += 1;
    }
    return out.join('');
}
export function parseInterfaceGraph(rawSource) {
    // Комментарии и содержимое строк гасятся ДО подсчёта скобок: иначе `}` в комментарии обрезает
    // тело, `{` в строке его раздувает, а имя интерфейса внутри строки становится ребром графа.
    const source = stripCommentsAndStrings(rawSource);
    const names = new Set();
    const headRe = /(?:^|\n)\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g;
    for (let m = headRe.exec(source); m !== null; m = headRe.exec(source))
        names.add(m[1]);
    const graph = new Map();
    headRe.lastIndex = 0;
    for (let m = headRe.exec(source); m !== null; m = headRe.exec(source)) {
        const name = m[1];
        const open = source.indexOf('{', m.index + m[0].length);
        if (open === -1)
            continue;
        let depth = 0;
        let close = -1;
        for (let i = open; i < source.length; i += 1) {
            const ch = source[i];
            if (ch === '{')
                depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    close = i;
                    break;
                }
            }
        }
        if (close === -1)
            continue;
        const body = source.slice(open + 1, close);
        // Split the body into top-level entries at depth 0 (`;` inside an inline `{...}` must not cut).
        const entries = [];
        let entry = '';
        let d = 0;
        for (const ch of body) {
            if (ch === '{' || ch === '(' || ch === '<' || ch === '[')
                d += 1;
            else if (ch === '}' || ch === ')' || ch === '>' || ch === ']')
                d -= 1;
            if (ch === ';' && d === 0) {
                entries.push(entry);
                entry = '';
                continue;
            }
            entry += ch;
        }
        if (entry.trim() !== '')
            entries.push(entry);
        const fields = [];
        for (const raw of entries) {
            // strip comments, then match `readonly? name?: TYPE`
            const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
            if (text === '' || text.startsWith('['))
                continue; // index signature — by-design escape hatch
            const fm = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??:\s*([\s\S]+)$/.exec(text);
            if (fm === null)
                continue;
            const typeText = fm[2];
            const refs = new Set();
            const idRe = /[A-Za-z_$][\w$]*/g;
            for (let im = idRe.exec(typeText); im !== null; im = idRe.exec(typeText)) {
                if (names.has(im[0]) && im[0] !== name)
                    refs.add(im[0]);
            }
            fields.push({ field: fm[1], refs: [...refs] });
        }
        graph.set(name, fields);
    }
    return graph;
}
/** Every interface reachable from `root` (inclusive), via any field's declared-interface refs —
 * arrays, unions and nullables all count: `LoopStep[]`, `RetryProfile | null` open the same edge. */
export function reachableInterfaces(graph, root) {
    const seen = new Set();
    const queue = [root];
    while (queue.length > 0) {
        const name = queue.shift();
        if (seen.has(name) || !graph.has(name))
            continue;
        seen.add(name);
        for (const f of graph.get(name))
            for (const ref of f.refs)
                if (!seen.has(ref))
                    queue.push(ref);
    }
    return [...seen].sort();
}
/** The completeness check the equality guards could not perform: reachable(source) vs wired. */
export function checkGraphWiring(source, wired, root = 'LoopPlan') {
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
//# sourceMappingURL=loop-plan-graph.js.map