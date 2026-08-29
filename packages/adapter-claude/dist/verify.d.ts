/**
 * Verify step — structural validation of a Claude adapter `EmitResult`.
 *
 * A thin wrapper over `@dzhechkov/core`'s `verifySkillTree`, pinned to the
 * Claude Code skills root.
 *
 * @packageDocumentation
 */
import type { EmitResult, VerifyResult } from '@dzhechkov/core';
/**
 * Check that an {@link EmitResult} is a well-formed Claude Code skill tree.
 * See {@link verifySkillTree}.
 */
export declare function verifyClaudeEmit(emit: EmitResult): VerifyResult;
//# sourceMappingURL=verify.d.ts.map