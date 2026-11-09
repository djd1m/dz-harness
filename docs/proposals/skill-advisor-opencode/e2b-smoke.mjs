// Opt-in external E2B/OpenRouter smoke test. Makes billable API calls; never deploys user apps.
// Keys come from environment, never from arguments or checked-in files.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkOpenCodeAdvice,
  parseOpenCodeDraft,
} from "../../../packages/skills-meta/skill-advisor/scripts/check-opencode-advice.mjs";
const { Sandbox } = await import(process.env.E2B_SDK_MODULE ?? "e2b");
if (!process.argv[2])
  throw new Error("Usage: node e2b-smoke.mjs <private-output-directory>");
const keys = {
  E2B_API_KEY: process.env.E2B_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};
if (!keys.E2B_API_KEY || !keys.OPENROUTER_API_KEY)
  throw new Error("E2B_API_KEY and OPENROUTER_API_KEY must be configured.");
process.umask(0o077);
const dir = resolve(process.argv[2]);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const root = fileURLToPath(
  new URL("../../../packages/skills-meta/skill-advisor", import.meta.url),
);
const advisorModel = process.env.ADVISOR_MODEL ?? "anthropic/claude-haiku-5.5";
const safe = (s) =>
  Object.values(keys)
    .filter(Boolean)
    .reduce((a, k) => a.replaceAll(k, "[REDACTED]"), String(s));
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
let sandbox;
const report = {
  startedAt: new Date().toISOString(),
  model: "openrouter/" + advisorModel,
  cli: "0.8.61",
  meta: "0.9.75",
  turns: [],
};
try {
  sandbox = await Sandbox.create("opencode", {
    apiKey: keys.E2B_API_KEY,
    envs: { OPENROUTER_API_KEY: keys.OPENROUTER_API_KEY },
    timeoutMs: 600000,
    requestTimeoutMs: 30000,
    metadata: { purpose: "dz-skill-advisor-native-check" },
  });
  fs.writeFileSync(
    dir + "/active-sandbox.json",
    JSON.stringify({ id: sandbox.sandboxId }),
  );
  report.sourceSha256 = Object.fromEntries(
    [
      "SKILL.md",
      "scripts/check-opencode-advice.mjs",
    "scripts/check-advice-review.mjs",
    "evals/advice-review.test.mjs",
      "evals/opencode.test.mjs",
    ].map((file) => [
      file,
      createHash("sha256")
        .update(fs.readFileSync(root + "/" + file))
        .digest("hex"),
    ]),
  );
  const run = async (command, timeoutMs = 30000) => {
    let r;
    try {
      r = await sandbox.commands.run(command, { cwd: "/home/user", timeoutMs });
    } catch (e) {
      throw new Error(
        command +
          " " +
          safe(e.result?.stderr ?? e.message) +
          " " +
          safe(e.result?.stdout ?? "").slice(-500),
      );
    }
    if (r.exitCode !== 0)
      throw new Error(
        "Command failed: " + command + " " + safe(r.stderr).slice(0, 500),
      );
    return r;
  };
  await run(
    "mkdir -p advisor && cd advisor && npm init -y >/dev/null && npm install --ignore-scripts --save-exact --no-audit --no-fund @dzhechkov/harness-cli@0.8.61 @dzhechkov/skills-meta@0.9.75",
    120000,
  );
  for (const file of [
    "SKILL.md",
    "scripts/check-opencode-advice.mjs",
    "scripts/check-advice-review.mjs",
    "evals/advice-review.test.mjs",
    "evals/opencode.test.mjs",
  ]) {
    await sandbox.files.write(
      "/home/user/advisor/node_modules/@dzhechkov/skills-meta/skill-advisor/" +
        file,
      fs.readFileSync(root + "/" + file, "utf8"),
    );
  }
  const initialized = await run(
    "cd advisor && ./node_modules/.bin/dz init --target opencode --select skill-advisor --no-hooks --no-integrations",
  );
  report.runtimeVersion = (await run("opencode --version")).stdout.trim();
  report.initStdout = safe(initialized.stdout);
  for (const file of [
    "SKILL.md",
    "scripts/check-opencode-advice.mjs",
    "scripts/check-advice-review.mjs",
    "evals/advice-review.test.mjs",
    "evals/opencode.test.mjs",
  ]) {
    const actual = await sandbox.files.read(
      "/home/user/advisor/.opencode/skills/skill-advisor/" + file,
    );
    if (actual !== fs.readFileSync(root + "/" + file, "utf8"))
      throw new Error("Adapter changed " + file);
  }
  report.adapterCopiedAllChangedFiles = true;
  const unit = await run(
    "cd advisor && node --test .opencode/skills/skill-advisor/evals/*.test.mjs",
  );
  report.sandboxUnitTests = safe(unit.stdout);
  const registry = JSON.parse(
    (await run("cd advisor && ./node_modules/.bin/dz registry --json")).stdout,
  );
  report.registryCount = registry.entries.length;
  fs.writeFileSync(dir + "/registry.json", JSON.stringify(registry, null, 2));
  const lock = await sandbox.files.read("/home/user/advisor/package-lock.json");
  fs.writeFileSync(dir + "/package-lock.json", lock);
  report.lockSha256 = createHash("sha256").update(lock).digest("hex");
  await sandbox.files.write(
    "/home/user/advisor/registry.json",
    JSON.stringify(
      registry.entries.map(({ id, description }) => ({ id, description })),
      null,
      2,
    ),
  );
  await sandbox.files.write(
    "/home/user/advisor/source-paths.json",
    JSON.stringify(
      Object.fromEntries(registry.entries.map((e) => [e.id, e.path])),
      null,
      2,
    ),
  );
  const agents =
    'You are a Russian-language DZ Harness advisor in OpenCode. Use skill-advisor. This is an internal consultation service test: your final message is a JSON draft consumed by a HOST gate, never displayed directly. The HOST calls check-opencode-advice.mjs with the actual registry and displays only accepted output. Return EXACTLY one JSON object, no markdown fences or commentary in final output. Use native registry skills only, 1 or 2 distinct recommendations with task, recommendations [{name,type:"skill",fit,why}], gaps and optional pipeline. OMIT install: the host generates it. Never install packages or perform the user task. If a toolkit lacks a verified OpenCode installer, describe that limitation in gaps. Use the native read tool for skill resources. The actual registry paths are in source-paths.json. Before detailed claims, read the chosen primary source via that index; do not infer absence of capabilities from a short description. The host has already run dz registry --json and saved an exact IDs/descriptions projection of its real output to /home/user/advisor/registry.json; use the read tool to inspect it. Do not run shell commands. The host also supplies dz recommend results for each question. Use skill tool name=skill-advisor first. User explicitly requests JSON draft for the host gate, so do not render prose as final output.';
  await sandbox.files.write("/home/user/advisor/AGENTS.md", agents);
  const model = advisorModel;
  await sandbox.files.write(
    "/home/user/advisor/opencode.json",
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        model: "openrouter/" + model,
        small_model: "openrouter/" + model,
        permission: {
          "*": "deny",
          read: "allow",
          glob: "allow",
          grep: "allow",
          list: "allow",
          skill: { "*": "deny", "skill-advisor": "allow" },
          bash: {
            "*": "deny",
            "dz registry*": "allow",
            "dz recommend*": "allow",
          },
          external_directory: "deny",
        },
        provider: {
          openrouter: {
            models: {
              [model]: {
                options: { reasoning: { enabled: false }, maxTokens: 1800 },
              },
            },
          },
        },
      },
      null,
      2,
    ),
  );
  const cases = [
    {
      id: "feature",
      prompt:
        "В действующем приложении надо провести новую возможность от требований через архитектурное решение до проверок. Какой навык взять первым?",
      expected: "feature-adr",
    },
    {
      id: "research",
      prompt:
        "Нужно исследовать GitHub-проекты и сохранить проверяемые ссылки на источники. Подбери первый набор навыков и объясни ограничения.",
      expected: "goap-research-ed25519",
    },
    {
      id: "cloudru",
      prompt:
        "Развернуть приложение из GitHub на Cloud.ru, настроить проверки и сопровождение. Объясни выбор навыков, порядок применения и ограничения.",
      expected: "deploy-on-cloudru-vm",
    },
  ];
  for (const [index, c] of cases.entries()) {
    console.log(JSON.stringify({ starting: c.id }));
    const baseline = await run(
      "cd advisor && ./node_modules/.bin/dz recommend " + quote(c.prompt),
    );
    const request =
      'Сначала вызови инструмент skill с аргументом {\"name\":\"skill-advisor\"}. Задача: ' +
      c.prompt +
      "\nЭто запрос внутреннего API: ответ нужен строго одним JSON-объектом без Markdown и текста вне JSON. Поля: task, recommendations (1–2 элемента: name, type=skill, fit=high|medium|low, why), gaps. НЕ включай install — команды установки сформирует и проверит хост. Если задача просит порядок применения, включи pipeline только из имён выбранных рекомендаций. Прочитай точный источник основного выбранного навыка по индексу source-paths.json: подробные утверждения и оговорки должны опираться на реальный текст навыка. Не добавляй слабую рекомендацию только из-за совпадения слова GitHub, одной подходящей достаточно. Используй только реальные имена из registry.json (хост уже выполнил dz registry --json и сохранил проекцию точных id/description без потери этих полей, прочитай её через read). Не запускай bash. Не пытайся запускать checker сам: для этого внутреннего API он ОБЯЗАТЕЛЬНО запускается хостом вне модели. Ты возвращаешь только черновик, который ещё не проверен. Вот фактический вывод dz recommend: " +
      baseline.stdout;
    const start = Date.now();
    const r = await run(
      'cd advisor && PATH="/home/user/advisor/node_modules/.bin:$PATH" opencode run --format json --model ' +
        quote("openrouter/" + model) +
        " " +
        quote(request),
      90000,
    );
    const raw = safe(r.stdout);
    fs.writeFileSync(dir + "/" + c.id + ".jsonl", raw);
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const texts = events
      .filter((e) => e.type === "text")
      .map((e) => e.part?.text ?? "");
    const tools = events
      .filter((e) => e.type === "tool_use")
      .map((e) => ({
        tool: e.part?.tool,
        status: e.part?.state?.status,
        input: e.part?.state?.input,
      }));
    const turn = {
      id: c.id,
      prompt: c.prompt,
      ms: Date.now() - start,
      texts,
      tools,
      expected: c.expected,
    };
    try {
      const text = texts.at(-1) ?? "";
      const draft = parseOpenCodeDraft(text);
      turn.checked = checkOpenCodeAdvice(registry, draft);
      turn.gateAccepted = true;
      turn.expectedPresent =
        turn.checked.recommendations.some((p) => p.name === c.expected) ||
        turn.checked.pipeline?.includes(c.expected) === true;
    } catch (error) {
      turn.gateAccepted = false;
      turn.error = safe(error.message);
    }
    if (turn.checked) {
      turn.sources = await Promise.all(turn.checked.recommendations.map(async (pick) => {
        const entry = registry.entries.find(entry => entry.id === pick.name);
        return { id: pick.name, coverage: "excerpt", text: await sandbox.files.read(resolve("/home/user/advisor", entry.path, "SKILL.md")) };
      }));
    }
    turn.expectedPrimary =
      turn.checked?.recommendations[0]?.name === c.expected;
    const primaryPath = registry.entries.find(
      (entry) => entry.id === turn.checked?.recommendations[0]?.name,
    )?.path;
    turn.primarySourceRead =
      typeof primaryPath === "string" &&
      tools.some(
        (tool) =>
          tool.tool === "read" &&
          tool.status === "completed" &&
          tool.input?.filePath ===
            resolve("/home/user/advisor", primaryPath, "SKILL.md"),
      );
    turn.requestedOrderPresent =
      c.id !== "cloudru" ||
      (Array.isArray(turn.checked?.pipeline) &&
        turn.checked.pipeline.length > 0);
    turn.nativeSkillLoaded = tools.some(
      (t) =>
        t.tool === "skill" &&
        t.status === "completed" &&
        t.input?.name === "skill-advisor",
    );
    report.turns.push(turn);
    fs.writeFileSync(dir + "/report.json", JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        id: c.id,
        ms: turn.ms,
        accepted: turn.gateAccepted,
        expectedPresent: turn.expectedPresent,
        picks: turn.checked?.recommendations.map((p) => p.name),
        error: turn.error,
      }),
    );
  }
} catch (error) {
  report.error = safe(error.message);
  console.log(JSON.stringify({ error: report.error }));
} finally {
  if (sandbox) {
    try {
      report.deleted = await sandbox.kill();
      try {
        await Sandbox.getInfo(sandbox.sandboxId, { apiKey: keys.E2B_API_KEY });
        report.independentlyAbsent = false;
      } catch (e) {
        report.independentlyAbsent =
          e.status === 404 || /not found|404/i.test(e.message);
        report.absenceError = safe(e.message).slice(0, 250);
      }
    } catch (e) {
      report.deleted = false;
      report.cleanupError = safe(e.message);
    }
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(dir + "/report.json", JSON.stringify(report, null, 2));
  report.passed =
    !report.error &&
    report.turns.length === 3 &&
    report.turns.every(
      (t) =>
        t.gateAccepted &&
        t.expectedPrimary &&
        t.primarySourceRead &&
        t.nativeSkillLoaded &&
        t.requestedOrderPresent,
    ) &&
    report.deleted === true &&
    report.independentlyAbsent === true;
  fs.writeFileSync(dir + "/report.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      passed: report.passed,
      deleted: report.deleted,
      independentlyAbsent: report.independentlyAbsent,
      turns: report.turns.length,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
