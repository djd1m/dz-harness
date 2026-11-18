// Opt-in paid review: caller supplies trusted registry and captured source snapshots.
import fs from 'node:fs';
import { makeAdviceReviewRequest, checkAdviceReview, reviewInstructions } from '../../../packages/skills-meta/skill-advisor/scripts/check-advice-review.mjs';
import { parseOpenCodeDraft } from '../../../packages/skills-meta/skill-advisor/scripts/check-opencode-advice.mjs';
if (process.argv.length !== 4) throw new Error('Usage: node review-advice.mjs <input.json> <new-report.json>');
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('OPENROUTER_API_KEY required');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const request = makeAdviceReviewRequest(input.registry, input.draft, input.sources, input.userTask);
const serialized = JSON.stringify(request);
if (serialized.length > 400000) throw new Error('Review input exceeds bounded context; no answer released');
process.umask(0o077);
// Reserve output first, so a typo cannot overwrite an earlier result after a paid call.
const fd = fs.openSync(process.argv[3], 'wx', 0o600);
const report = { startedAt: new Date().toISOString(), model: process.env.ADVISOR_REVIEW_MODEL ?? 'anthropic/claude-haiku-5.5', request, result: { accepted: false, issues: ['Review not completed'] } };
try {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: report.model, temperature: 0, max_tokens: 6000,
      messages: [{ role: 'system', content: reviewInstructions }, { role: 'user', content: serialized }] }),
  });
  if (!response.ok) throw new Error(`Reviewer HTTP ${response.status}`);
  const body = await response.json();
  if (body.choices?.[0]?.finish_reason !== 'stop') throw new Error('Incomplete reviewer completion');
  report.review = parseOpenCodeDraft(body.choices[0].message.content);
  report.usage = body.usage;
  report.result = checkAdviceReview(request, report.review);
} catch (error) {
  report.error = String(error.message).replaceAll(key, '[REDACTED]');
  report.result = { accepted: false, issues: ['Review failed; answer withheld'] };
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(fd, JSON.stringify(report, null, 2).replaceAll(key, '[REDACTED]'));
  fs.closeSync(fd);
}
console.log(JSON.stringify({ accepted: report.result.accepted, issues: report.result.issues, error: report.error }));
if (!report.result.accepted) process.exitCode = 1;
