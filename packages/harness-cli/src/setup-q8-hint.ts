export interface SetupQ8HintFacts {
  totalMemoryBytes: number;
  memoryBackend: 'agentdb' | 'jsonl' | 'unknown';
  setupComplete: boolean;
  memoryEnabled: boolean;
  vectorMode: 'auto' | 'agentdb' | 'rvf' | 'off';
  embedDtype: 'fp32' | 'q8' | 'error';
}

export interface SetupOutcomeFacts {
  codexHooksOk: boolean;
  failedStepCount: number;
  integrationsOk: boolean;
  skillsOk: boolean;
}

/** The final CLI exit condition also gates any post-setup recommendation. */
export function setupSucceeded(facts: SetupOutcomeFacts): boolean {
  return facts.codexHooksOk && facts.failedStepCount === 0 && facts.integrationsOk && facts.skillsOk;
}

const FOUR_GIB = 4 * 1024 ** 3;

/** Advisory only: setup never changes the selected embedding dtype. */
export function setupQ8Hint(facts: SetupQ8HintFacts): string | null {
  if (!Number.isFinite(facts.totalMemoryBytes) || facts.totalMemoryBytes <= 0 || facts.totalMemoryBytes > FOUR_GIB
    || !facts.setupComplete || !facts.memoryEnabled || facts.memoryBackend !== 'agentdb'
    || facts.vectorMode === 'off' || facts.vectorMode === 'rvf' || facts.embedDtype !== 'fp32') return null;
  return 'dz setup: ℹ Host RAM ≤ 4 GiB: consider memory.embed.dtype=q8 for embeddings. '
    + 'Quantized model weights may need downloading; reindex existing vectors with dz vector reindex after changing dtype. '
    + 'Setup did not change your dtype.';
}
