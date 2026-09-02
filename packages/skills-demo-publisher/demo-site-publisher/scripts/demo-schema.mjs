import { readJson, CliError, EXIT } from './common.mjs';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCENARIO = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP_KEYS = new Set(['goto', 'click', 'tap', 'fill', 'type', 'press', 'wait', 'screenshot', 'caption']);
const DEFAULT_BUDGET = Object.freeze({
  maxFileMB: 20, maxSetMB: 100, maxClipSeconds: 32, maxMontageSeconds: 240, maxRepoMB: 900,
});
const DEFAULT_ENCODE = Object.freeze({ crf: 26, fps: 30, viewport: { width: 1280, height: 800 } });
const VIEWPORTS = new Set(['1280x800', '1280x720', '1920x1080']);

export class DemoError extends CliError {
  constructor(path, hint) {
    super(`${path}: ${hint}`, EXIT.USAGE_OR_SCHEMA);
    this.path = path;
    this.hint = hint;
  }
}
const objectAt = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DemoError(path, 'ожидался объект');
  return value;
};
const textAt = (value, path) => {
  if (typeof value !== 'string' || value.trim() === '') throw new DemoError(path, 'нужна непустая строка');
  return value.trim();
};
const slugAt = (value, path, pattern = SLUG) => {
  const slug = textAt(value, path);
  if (!pattern.test(slug) || slug.length > 40) throw new DemoError(path, 'нужно kebab-имя длиной до 40 символов');
  return slug;
};

function parseStep(step, path) {
  objectAt(step, path);
  const actions = Object.keys(step).filter((key) => STEP_KEYS.has(key));
  if (actions.length !== 1) throw new DemoError(path, `нужно ровно одно действие: ${[...STEP_KEYS].join(', ')}`);
  const type = actions[0];
  const value = step[type];
  if (type !== 'wait') textAt(value, `${path}.${type}`);
  if (type === 'wait' && !(Number.isFinite(value) && value >= 0) && typeof value !== 'string') {
    throw new DemoError(`${path}.wait`, 'нужны миллисекунды >= 0 или селектор');
  }
  for (const key of Object.keys(step)) {
    if (![type, 'text', 'key', 'pre', 'hold', 'post', 'id'].includes(key)) {
      throw new DemoError(`${path}.${key}`, 'неизвестное поле шага');
    }
  }
  return { ...step, type, value };
}

export function parseDemo(input) {
  const value = objectAt(input, '$');
  for (const forbidden of ['budget', 'encode', 'viewport']) {
    if (forbidden in value) throw new DemoError(`$.${forbidden}`, 'это поле принадлежит demo-site.config.json');
  }
  const scenarios = value.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) throw new DemoError('$.scenarios', 'нужен непустой массив');
  const ids = new Set();
  const parsed = scenarios.map((scenario, index) => {
    const path = `$.scenarios[${index}]`;
    objectAt(scenario, path);
    const id = slugAt(scenario.id, `${path}.id`, SCENARIO);
    if (ids.has(id)) throw new DemoError(`${path}.id`, `повтор: ${id}`);
    ids.add(id);
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new DemoError(`${path}.steps`, 'нужен непустой массив');
    return {
      id, title: textAt(scenario.title, `${path}.title`),
      caption: textAt(scenario.caption, `${path}.caption`),
      steps: scenario.steps.map((step, stepIndex) => parseStep(step, `${path}.steps[${stepIndex}]`)),
    };
  });
  return {
    slug: slugAt(value.slug, '$.slug'), title: textAt(value.title, '$.title'),
    purpose: typeof value.purpose === 'string' ? value.purpose.trim() : '',
    lang: value.lang == null ? 'ru' : value.lang,
    baseUrl: textAt(value.baseUrl, '$.baseUrl'), scenarios: parsed,
    cards: objectAt(value.cards || { intro: value.title, outro: 'Готово' }, '$.cards'),
  };
}

const cap = (value, fallback) => Number.isFinite(value) && value > 0 ? Math.min(value, fallback) : fallback;
export function parseDemoSet(input) {
  const value = objectAt(input, '$');
  const budgetInput = objectAt(value.budget || {}, '$.budget');
  if (Number.isFinite(budgetInput.maxFileMB) && budgetInput.maxFileMB > 100) throw new DemoError('$.budget.maxFileMB', 'лимит GitHub нельзя поднять выше 100 MB');
  const budget = Object.fromEntries(Object.entries(DEFAULT_BUDGET).map(([key, fallback]) => [key, cap(budgetInput[key], fallback)]));
  const encodeInput = objectAt(value.encode || {}, '$.encode');
  const viewport = objectAt(encodeInput.viewport || DEFAULT_ENCODE.viewport, '$.encode.viewport');
  if (!VIEWPORTS.has(`${viewport.width}x${viewport.height}`)) throw new DemoError('$.encode.viewport', 'разрешены 1280x800, 1280x720, 1920x1080');
  const crf = cap(encodeInput.crf, DEFAULT_ENCODE.crf);
  if (crf < 26 || crf > 40) throw new DemoError('$.encode.crf', 'разрешено 26..40');
  if (encodeInput.fps != null && encodeInput.fps !== 30) throw new DemoError('$.encode.fps', 'частота фиксирована: 30');
  return {
    set: slugAt(value.set, '$.set'), title: textAt(value.title, '$.title'), budget,
    encode: { crf, fps: 30, viewport: { width: viewport.width, height: viewport.height } },
    webm: value.webm === true,
  };
}

export const loadDemo = (path) => parseDemo(readJson(path));
export const loadDemoSet = (path) => parseDemoSet(readJson(path));
export { DEFAULT_BUDGET, DEFAULT_ENCODE, STEP_KEYS };
