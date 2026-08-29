/**
 * `@dzhechkov/adapter-copilot` — the GitHub Copilot platform adapter.
 *
 * Unlike the five lossless skill-tree adapters (claude/codex/opencode/hermes/
 * openclaude), GitHub Copilot does NOT scan a `.../skills/` directory. It
 * auto-reads repo instructions from `.github/instructions/*.instructions.md`
 * (each with an `applyTo` glob). So a skill maps onto an **instruction file**,
 * not a skill tree — making this the harness's first **intentionally lossy**
 * adapter:
 *
 *   - no progressive disclosure (the instruction is always-on, `applyTo: "**"`),
 *   - `scripts/` become reference-only assets (Copilot can't execute them),
 *   - no skill-invocation command (Copilot has none).
 *
 * Per the {@link Adapter} contract, loss is surfaced as a warning; under
 * `strict` it throws instead. The canonical skill remains the lossless source —
 * re-compiling to `claude` is still full fidelity.
 *
 * See `docs/research/metaharness-analysis.md` §8 and `features/copilot-target/`.
 *
 * @packageDocumentation
 */

import { assertSafeId, normalizeAssetPath } from '@dzhechkov/core';
import type {
  Adapter,
  CanonicalSkill,
  CompileContext,
  EmitResult,
  SkillAsset,
  VerifyResult,
} from '@dzhechkov/core';

/** Directory Copilot auto-reads path-scoped instruction files from. */
export const COPILOT_INSTRUCTIONS_ROOT = '.github/instructions';
/** Where a skill's bundled assets land (reference-only — Copilot can't execute them). */
export const COPILOT_ASSETS_ROOT = '.github/copilot-skills';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_COPILOT_VERSION = '0.1.0';

/** Build the instruction-file body: our Copilot frontmatter + the verbatim skill body. */
function instructionFile(skill: CanonicalSkill): string {
  const description = skill.frontmatter.description ?? skill.id;
  // `skill.document.body` is the verbatim content AFTER the original frontmatter
  // fence, so we stack our own Copilot frontmatter without double-fencing.
  return `---\napplyTo: "**"\ndescription: ${JSON.stringify(description)}\n---\n\n${skill.document.body}`;
}

/**
 * The GitHub Copilot adapter — an intentionally **lossy** {@link Adapter}.
 *
 * Emits one always-on instruction file per skill plus reference-only assets.
 */
export const copilotAdapter: Adapter = {
  platform: 'copilot',
  compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    // Defend at the adapter boundary, exactly like the lossless skill-tree
    // engine does — ids and asset paths are not guaranteed safe at this layer.
    try {
      assertSafeId(skill.id);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const files: SkillAsset[] = [
      {
        path: `${COPILOT_INSTRUCTIONS_ROOT}/${skill.id}.instructions.md`,
        encoding: 'utf-8',
        content: instructionFile(skill),
      },
    ];
    try {
      for (const a of skill.assets) {
        files.push({
          path: `${COPILOT_ASSETS_ROOT}/${skill.id}/${normalizeAssetPath(a.path)}`,
          encoding: a.encoding,
          content: a.content,
        });
      }
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const scriptsNote =
      skill.assets.length > 0 ? ' scripts/ and other assets are reference-only (Copilot cannot execute them).' : '';
    const lossy =
      `copilot is a lossy target: "${skill.id}" is emitted as an always-on instruction file ` +
      `(no progressive disclosure, no skill-invocation command).${scriptsNote}`;
    if (ctx.strict === true) {
      return Promise.reject(new Error(`adapter-copilot: refusing lossy compile under strict mode — ${lossy}`));
    }
    return Promise.resolve({ files, warnings: [lossy] });
  },

  verify(emit: EmitResult): Promise<VerifyResult> {
    const errors: string[] = [];
    // Carry the lossy-compile warning(s) through so `dz verify --target copilot`
    // never reports skills as clean with no loss notice. This adapter is
    // intentionally lossy; the core invariant is that loss surfaces as a warning,
    // never silently (mirrors the lossless engine's verifySkillTree).
    const warnings: string[] = [...emit.warnings];
    // require a real `<root>/<id>.instructions.md` with a non-empty id segment
    const root = COPILOT_INSTRUCTIONS_ROOT.replace(/[.]/g, '\\.');
    const instrRe = new RegExp(`^${root}/[^/]+\\.instructions\\.md$`);
    const instruction = emit.files.find((f) => instrRe.test(f.path));
    if (!instruction) {
      errors.push('no .github/instructions/<id>.instructions.md was emitted');
    } else {
      // check applyTo ONLY inside the leading frontmatter block, not anywhere in the body
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(instruction.content);
      if (!fm || !/^applyTo:/m.test(fm[1] ?? '')) {
        errors.push('instruction file is missing the leading applyTo frontmatter');
      }
    }
    return Promise.resolve({ ok: errors.length === 0, errors, warnings });
  },
};
