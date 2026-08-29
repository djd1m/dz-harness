// Shared fixtures: a COMPLIANT produced-course object the hardened gate passes, plus mutators that
// break exactly one Head First property each (the ADR-003 P1 discrimination proof). Deterministic.
//
// Every section embeds a distinctive concept token (e.g. "widgetone") in its theory, its exercise, and
// its finalTest (P2 three-encoding), threads the persona "Nadia" through EVERY section (D1), carries a
// full reflective quartet (D2), and uses a content-bearing exercise (P5). Citations resolve to real KB
// ids (P5/P2/P3/P8/P6/P4). This lets each mutator remove ONE property and prove the verdict flips.

const PERSONA = 'Nadia';
const TYPES = ['quiz', 'flashcards', 'matching', 'drag-and-drop', 'builder', 'scenario'];
const CITES = ['P5', 'P2', 'P3', 'P8', 'P6', 'P4'];

export function compliantCourse() {
  const sections = TYPES.map((t, i) => {
    const id = `topic-${i + 1}`;
    const kw = `widget${['one', 'two', 'three', 'four', 'five', 'six'][i]}`; // distinctive concept token
    const s = {
      id,
      order: i + 1,
      title: `${i + 1}. Topic about ${kw}`,
      shortTitle: `T${i + 1}`,
      description: `About ${kw}`,
      icon: ['🧭', '🔑', '🧩', '🪜', '🛠️', '🎬'][i],
      interactiveType: t,
      keyConcept: kw,
      theory: `Hey, you and ${PERSONA} are digging into ${kw}. ${PERSONA} tries it and it clicks. The idea of ${kw} shows up again below.`,
      reflection: {
        strengths: `${kw} is simple and fast for ${PERSONA}.`,
        weaknesses: `${kw} struggles at large scale.`,
        rating: 4,
        wrapup: `Reach for ${kw} when speed beats scale.`,
      },
      finalTest: { id: `final-${id}`, sectionId: id, question: `Which statement about ${kw} is correct?`, options: [`${kw} is fast`, `${kw} is a fruit`, `${kw} is a planet`, `${kw} is a color`], correctAnswer: 0 },
      methodPattern: CITES[i],
    };
    // A quiz always present (it also carries the concept token for quiz-type sections)
    s.quiz = [{ id: `${id}-q1`, question: `What does ${kw} do?`, options: [`${kw} helps`, 'nothing', 'it hides', 'it breaks'], correctAnswer: 0, explanation: `${kw} helps.` }];
    if (t === 'flashcards') s.exercise = { cards: [{ front: `Define ${kw}`, back: 'a small unit' }, { front: 'Second card', back: 'another fact' }] };
    else if (t === 'matching') s.exercise = { pairs: [{ left: `${kw} input`, right: 'a value' }, { left: `${kw} output`, right: 'a result' }] };
    else if (t === 'drag-and-drop') s.exercise = { items: [{ id: 'a', label: `first ${kw} step` }, { id: 'b', label: 'second step' }], correctOrder: ['a', 'b'] };
    else if (t === 'builder') s.exercise = { instruction: `Build the ${kw} command`, parts: ['run', kw], correctCommand: `run ${kw}`, hints: ['start with run'] };
    else if (t === 'scenario') s.exercise = { title: `The ${kw} decision`, scenario: 'a setup', steps: [{ id: 'step1', description: `You must choose about ${kw}.`, options: [{ id: 'a', text: `pick ${kw}`, result: 'positive', feedback: 'good' }, { id: 'b', text: 'ignore it', result: 'negative', feedback: 'bad' }] }] };
    else s.exercise = { note: `quiz payload for ${kw} lives in quiz[]` }; // quiz type
    return s;
  });

  const achievements = [
    { id: 'first-step', title: 'First step', description: 'Started', icon: '🥾', conditionRef: { type: 'sections-completed', n: 1 } },
    { id: 'halfway', title: 'Halfway', description: 'Half done', icon: '🌗', conditionRef: { type: 'sections-completed', n: 3 } },
    { id: 'perfectionist', title: 'Perfect', description: 'Perfect score', icon: '💯', conditionRef: { type: 'perfect-section' } },
    { id: 'full-course', title: 'Complete', description: 'All done', icon: '🏁', conditionRef: { type: 'all-sections' } },
    { id: 'test-passed', title: 'Passed', description: 'Passed final', icon: '🎓', conditionRef: { type: 'final-test-pass', min: 70 } },
    { id: 'quiz-ace', title: 'Quiz ace', description: 'Group one', icon: '🎯', conditionRef: { type: 'section-group', ids: ['topic-1'] } },
    { id: 'builder-badge', title: 'Builder', description: 'Group two', icon: '🧱', conditionRef: { type: 'section-group', ids: ['topic-5'] } },
    { id: 'story-teller', title: 'Storyteller', description: 'Group three', icon: '📖', conditionRef: { type: 'section-group', ids: ['topic-6'] } },
  ];

  return {
    language: 'en',
    courseTitle: 'Learn The Package',
    courseDescription: 'A Head First style course.',
    persona: { name: PERSONA, description: 'a developer adopting the tool' },
    finalTestPassThreshold: 70,
    sections,
    // topics[] Step-0 projection (F4): the contract requires it and the gate now checks ids match 1:1.
    topics: sections.map((s) => ({ id: s.id, title: s.title, keyConcepts: [s.keyConcept], suggestedExercise: s.interactiveType, methodPattern: s.methodPattern, source: 'fixture' })),
    achievements,
    faqData: [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }],
  };
}

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// One-property mutators. Each breaks a DISTINCT gate check → verdict must flip to FAIL.
export const MUTATORS = {
  // P5 — content present but meaningless (blank/null shells) must FAIL (Codex CRITICAL-1)
  'blank-but-present-exercise': (c) => { c.sections[1].exercise = { cards: [{ front: '', back: '' }, { front: '   ', back: null }] }; return c; },
  'no-exercise': (c) => { const s = c.sections[1]; s.exercise = {}; return c; },
  'quiz-options-blank': (c) => { c.sections[0].quiz = [{ id: 'x', question: 'q', options: ['', ''], correctAnswer: 0, explanation: 'e' }]; return c; },
  // P7 — diversity
  '3x-same-type': (c) => {
    for (const i of [0, 1, 2]) { c.sections[i].interactiveType = 'quiz'; c.sections[i].quiz = [{ id: `q${i}`, question: `q ${c.sections[i].keyConcept}`, options: [`${c.sections[i].keyConcept} a`, 'b'], correctAnswer: 0, explanation: 'e' }]; c.sections[i].exercise = { note: 'quiz' }; }
    return c;
  },
  // structural — one finalTest per section
  'missing-finalTest': (c) => { delete c.sections[2].finalTest; return c; },
  // P2 — concept present in theory only, NOT re-encoded in exercise/final (Codex CRITICAL-2)
  'concept-not-in-exercise': (c) => { c.sections[1].exercise = { cards: [{ front: 'generic front', back: 'generic back' }, { front: 'another', back: 'thing' }] }; return c; },
  'concept-not-in-final': (c) => { c.sections[3].finalTest = { id: 'final-topic-4', sectionId: 'topic-4', question: 'A generic unrelated question?', options: ['aaa', 'bbb', 'ccc', 'ddd'], correctAnswer: 0 }; return c; },
  // D2 — full quartet required; a marker-only reflection must FAIL (Codex HIGH-5)
  'marker-only-D2': (c) => { c.sections[2].reflection = { tradeoffs: 'x' }; return c; },
  'quartet-missing-wrapup': (c) => { delete c.sections[4].reflection.wrapup; return c; },
  // D1 — persona must be in EVERY section; missing from ONE must FAIL (Codex MEDIUM-6)
  'persona-missing-one-section': (c) => { c.sections[3].theory = `You are digging into ${c.sections[3].keyConcept}. It clicks. ${c.sections[3].keyConcept} appears again.`; return c; },
  'no-persona': (c) => { c.persona = { name: '', description: '' }; return c; },
  // citations — a bogus id like P99 must FAIL (Codex HIGH-4)
  'bogus-citation-P99': (c) => { c.sections[0].methodPattern = 'P99'; return c; },
  // achievements — dedupe + meaningful metadata (Codex MEDIUM-7)
  'few-achievements': (c) => { c.achievements = c.achievements.slice(0, 5); return c; },
  'duplicate-achievement-condition': (c) => { c.achievements[7].conditionRef = { type: 'sections-completed', n: 1 }; return c; }, // same as first-step
  'blank-achievement-id': (c) => { c.achievements[6].id = '   '; return c; },

  // --- Codex round-2 (deeper "presence not meaning") bypasses ---
  // P2 — concept only in exercise METADATA (id/marker), not in visible learner text → must FAIL
  'concept-only-in-metadata': (c) => {
    const kw = c.sections[1].keyConcept;
    c.sections[1].exercise = { marker: kw, id: kw, cards: [{ front: 'generic front', back: 'plain back' }, { front: 'second card', back: 'other fact' }] };
    return c;
  },
  // D1 — persona name "Nadia Developer": one section uses only the generic role word "Developer" → FAIL
  'persona-generic-token-only': (c) => {
    c.persona = { name: 'Nadia Developer', description: 'a developer' };
    const kw = c.sections[3].keyConcept;
    c.sections[3].theory = `You and the Developer explore ${kw}. The Developer nods as ${kw} clicks into place.`;
    return c;
  },
  // gamification — a duplicate condition with REORDERED keys must still be caught as a duplicate → FAIL
  'achievement-reordered-condition-dupe': (c) => { c.achievements[7].conditionRef = { n: 1, type: 'sections-completed' }; return c; }, // = first-step, keys reversed
  // gamification — a section-group whose `ids` array is a PERMUTATION of another's is the same condition
  'achievement-permuted-ids-dupe': (c) => { c.achievements[7].conditionRef = { type: 'section-group', ids: ['topic-5', 'topic-1'] }; c.achievements[5].conditionRef = { type: 'section-group', ids: ['topic-1', 'topic-5'] }; return c; },
  // P5 — quiz options that are only zero-width/invisible characters → must FAIL
  'quiz-options-invisible': (c) => { c.sections[0].quiz = [{ id: 'x', question: 'q', options: ['\u200B', '\u200C\uFEFF'], correctAnswer: 0, explanation: 'e' }]; return c; },
};
