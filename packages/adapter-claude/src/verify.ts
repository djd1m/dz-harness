/**
 * Verify step — structural validation of a Claude adapter `EmitResult`.
 *
 * A thin wrapper over `@dzhechkov/core`'s `verifySkillTree`, pinned to the
 * Claude Code skills root.
 *
 * @packageDocumentation
 */

import { verifySkillTree } from '@dzhechkov/core';
import type { EmitResult, VerifyResult } from '@dzhechkov/core';

import { CLAUDE_SKILLS_ROOT } from './compile.js';

/**
 * Check that an {@link EmitResult} is a well-formed Claude Code skill tree.
 * See {@link verifySkillTree}.
 */
export function verifyClaudeEmit(emit: EmitResult): VerifyResult {
  return verifySkillTree(emit, { skillsRoot: CLAUDE_SKILLS_ROOT });
}
