// Independent labels define complete acceptable sets, not merely relevant individual IDs.
export function completeSelection(ids, sets) {
  return sets.some(set => set.length === ids.length && set.every(id => ids.includes(id)));
}
export function completeRetrieval(ids, sets) {
  return sets.some(set => set.every(id => ids.includes(id)));
}
export function policyMatch(choice, ground) {
  if (ground.coverage === 'full') {
    return choice.decision === 'recommend' && completeSelection(choice.scenarioIds, ground.acceptableScenarioSets);
  }
  if (ground.coverage === 'clarify' || ground.coverage === 'no-match') return choice.decision === ground.coverage;
  return ['clarify', 'no-match'].includes(choice.decision);
}
export function validateLabelBinding(document, filename, sha256) {
  if (document.questionFile !== filename || document.questionSha256 !== sha256) throw Error('Stale question/coverage binding');
}
export function validateLabels(questions, labels) {
  const ids = questions.map(q => q.id);
  if (new Set(ids).size !== ids.length || new Set(labels.map(l => l.id)).size !== labels.length ||
      labels.length !== questions.length || labels.some(l => !ids.includes(l.id))) throw Error('Question/label ID mismatch');
  for (const label of labels) {
    if (!['full', 'partial', 'absent', 'clarify', 'no-match'].includes(label.coverage) ||
        !Array.isArray(label.relevantScenarioIds)) throw Error('Invalid coverage label');
    if (label.coverage === 'full' && (!Array.isArray(label.acceptableScenarioSets) || !label.acceptableScenarioSets.length ||
        label.acceptableScenarioSets.some(set => !Array.isArray(set) || !set.length || set.length > 2 ||
          new Set(set).size !== set.length || set.some(id => !label.relevantScenarioIds.includes(id))))) {
      throw Error('Full coverage requires complete acceptable scenario sets');
    }
  }
}
