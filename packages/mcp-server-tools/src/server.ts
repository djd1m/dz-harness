/**
 * The DZ harness MCP server — registers the harness tools on an `McpServer`.
 *
 * @packageDocumentation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { agentsMdAdapter } from '@dzhechkov/adapter-agents-md';
import { claudeAdapter } from '@dzhechkov/adapter-claude';
import { codexAdapter } from '@dzhechkov/adapter-codex';
import { copilotAdapter } from '@dzhechkov/adapter-copilot';
import { cursorAdapter } from '@dzhechkov/adapter-cursor';
import { geminiAdapter } from '@dzhechkov/adapter-gemini';
import { hermesAdapter } from '@dzhechkov/adapter-hermes';
import { openclaudeAdapter } from '@dzhechkov/adapter-openclaude';
import { opencodeAdapter } from '@dzhechkov/adapter-opencode';
import { windsurfAdapter } from '@dzhechkov/adapter-windsurf';
import { PLATFORMS } from '@dzhechkov/core';
import type { Adapter, Platform } from '@dzhechkov/core';

import { listSkills, loadSkill } from './skills.js';
import {
  getSkillInfo,
  claimCheck,
  decideClaimCheckText,
  severityCounts,
  isGated,
} from '@dzhechkov/harness-core';
import { listPresets, getPreset } from '@dzhechkov/harness-presets';
import { MCP_SERVER_TOOLS_VERSION } from './version.js';

/** Configuration for {@link createDzMcpServer}. */
export interface DzMcpServerOptions {
  /** Directory the server reads skills from (`<dir>/<id>/SKILL.md`). */
  readonly skillsDir: string;
}

/**
 * Adapter for every supported platform, keyed by platform name.
 *
 * The key set must equal `PLATFORMS` (`@dzhechkov/core`) — the `Record<Platform, Adapter>` type enforces
 * it at compile time, and `test/adapters-cover-platforms.test.ts` enforces it structurally so a platform
 * added to core reds the suite until it is wired here. Exported so that test can read the keys.
 */
export const ADAPTERS: Record<Platform, Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
  hermes: hermesAdapter,
  openclaude: openclaudeAdapter,
  copilot: copilotAdapter,
  'agents-md': agentsMdAdapter,
  cursor: cursorAdapter,
  gemini: geminiAdapter,
  windsurf: windsurfAdapter,
};

/** A successful tool result carrying a pretty-printed JSON payload. */
function jsonResult(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** An error tool result. */
function errorResult(message: string): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build a configured DZ harness {@link McpServer} — `skill_list`, `skill_get`,
 * `skill_compile`, and `harness_verify` registered against `options.skillsDir`.
 * The caller connects it to a transport (stdio in production, in-memory in tests).
 */
export function createDzMcpServer(options: DzMcpServerOptions): McpServer {
  const { skillsDir } = options;
  const server = new McpServer({ name: 'dz-harness', version: MCP_SERVER_TOOLS_VERSION });

  server.registerTool(
    'skill_list',
    { description: 'List the skills available in the harness skills directory.' },
    () => jsonResult({ skillsDir, skills: listSkills(skillsDir) }),
  );

  server.registerTool(
    'skill_get',
    {
      description: "Read one skill: its SKILL.md frontmatter, body, and asset paths.",
      inputSchema: { id: z.string().describe('The skill id (its directory name).') },
    },
    ({ id }) => {
      try {
        const skill = loadSkill(skillsDir, id);
        return jsonResult({
          id: skill.id,
          frontmatter: skill.frontmatter,
          body: skill.document.body,
          assets: skill.assets.map((asset) => asset.path),
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    },
  );

  server.registerTool(
    'skill_compile',
    {
      description: 'Compile a skill for a target platform; returns the files that would be written.',
      inputSchema: {
        id: z.string().describe('The skill id.'),
        platform: z.enum(PLATFORMS).describe('Target platform.'),
      },
    },
    async ({ id, platform }) => {
      try {
        const emit = await ADAPTERS[platform].compile(loadSkill(skillsDir, id), { targetRoot: '.' });
        return jsonResult({
          platform,
          files: emit.files.map((file) => ({ path: file.path, bytes: file.content.length })),
          warnings: emit.warnings,
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    },
  );

  server.registerTool(
    'harness_verify',
    {
      description: 'Compile a skill for a platform and structurally verify the emitted result.',
      inputSchema: {
        id: z.string().describe('The skill id.'),
        platform: z.enum(PLATFORMS).default('claude').describe('Target platform (default: claude).'),
      },
    },
    async ({ id, platform }) => {
      try {
        const adapter = ADAPTERS[platform];
        const emit = await adapter.compile(loadSkill(skillsDir, id), { targetRoot: '.' });
        const result = await adapter.verify(emit);
        return jsonResult({ id, platform, ...result });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    },
  );

  // --- New v0.7.0 tools ---

  server.registerTool(
    'skill_info',
    {
      description: 'Get detailed info about a skill: trust tier, version, assets, full frontmatter.',
      inputSchema: { id: z.string().describe('The skill id (its directory name).') },
    },
    ({ id }) => {
      const info = getSkillInfo(skillsDir, id);
      if (info === undefined) return errorResult(`skill not found: ${id}`);
      return jsonResult(info);
    },
  );

  server.registerTool(
    'preset_list',
    { description: 'List all available presets with their skill selections.' },
    () => jsonResult({ presets: listPresets() }),
  );

  server.registerTool(
    'preset_get',
    {
      description: 'Get a preset by name, including its full skill list.',
      inputSchema: { name: z.string().describe('The preset name.') },
    },
    ({ name }) => {
      const preset = getPreset(name);
      if (preset === undefined) return errorResult(`preset not found: ${name}`);
      return jsonResult(preset);
    },
  );

  server.registerTool(
    'claim_check_text',
    {
      description:
        'Vet a block of PROSE for untagged quantitative/accuracy claims before you write it to disk. ' +
        'Mirrors `dz claim-check`, but the input is TEXT, not a path — a voluntary check on a paragraph ' +
        'you have not saved yet. FAIL-CLOSED: empty/whitespace/non-string input is an ERROR, not a pass, ' +
        'because a claim-check called with nothing has vetted nothing. Findings are REPORTED, never thrown; ' +
        'a signature proves nothing about truthfulness — only that a numeric claim lacks a MEASURED/CLAIMED tag.',
      inputSchema: {
        text: z.string().describe('The prose to vet. Must be non-empty (fail-closed).'),
        failOn: z
          .enum(['high', 'medium', 'none'])
          .optional()
          .describe("Gate threshold for the reported `gated` flag (default 'high'). Never throws on findings."),
      },
    },
    ({ text, failOn }) => {
      const decision = decideClaimCheckText(text);
      if (decision.kind === 'error') {
        return errorResult('claim_check_text: ' + decision.reason);
      }
      const result = claimCheck(text);
      const counts = severityCounts(result);
      const threshold = failOn ?? 'high';
      return jsonResult({
        ok: result.ok,
        counts,
        failOn: threshold,
        gated: isGated(result, threshold),
        findings: result.findings,
      });
    },
  );

  return server;
}
