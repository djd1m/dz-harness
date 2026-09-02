#!/usr/bin/env node
'use strict';

/**
 * check-ports.cjs — enforce `.claude/rules/docker-ports.md` («Правило №0») against a real compose.
 *
 * NOT an event hook. Like `state-update.cjs`, it lives here because this directory already carries
 * plain Node utilities; nothing registers it in settings.json and nothing runs it on a schedule.
 * Invoke it deliberately:
 *
 *   node .claude/hooks/check-ports.cjs [path-to-project | path-to-compose-file]
 *   node .claude/hooks/check-ports.cjs --machine
 *
 * Exit codes — three, and the third is the point:
 *   0  the rule holds
 *   1  the rule is violated (each violation is printed with the service and the remedy)
 *   2  THE CHECK DID NOT RUN — no compose, no docker, or a config that would not parse
 *
 * A guard that answers "clean" when it could not look is worse than no guard: it converts an unknown
 * into a reassurance. That is why an absent compose, a missing docker and an unreadable config all
 * exit 2 rather than 0.
 *
 * It implements the RULE, not any prior script. In particular it checks `network_mode: host`, which
 * publishes everything a container listens on without any `ports:` entry at all.
 */

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SUBPROCESS_TIMEOUT_MS = 5000;
const SUBPROCESS_OPTIONS = {
  encoding: 'utf8',
  timeout: SUBPROCESS_TIMEOUT_MS,
  killSignal: 'SIGKILL',
  maxBuffer: 4 * 1024 * 1024,
};

// Storage recognised the way the rule names it — by image and by well-known port. Both lists live
// here, side by side, so a reader extending one can see the other.
// Recognition is a HEURISTIC and stays one — but it must not be a substring match. A substring
// called `rediscommander/redis-commander` storage (it is a web UI), and missed
// `mcr.microsoft.com/mssql/server` on its standard 1433 entirely. So: take the image NAME —
// the last path component, without registry, tag or digest — and anchor to it.
const STORAGE_NAMES = /^(postgres|postgresql|pgvector|mysql|mariadb|percona|mongo|mongodb|redis|valkey|keydb|elasticsearch|opensearch|minio|rabbitmq|memcached|clickhouse|cassandra|scylla|neo4j|influxdb|timescaledb|mssql|sqlserver|couchdb|etcd|qdrant)$/i;
const STORAGE_PORT = new Set([5432, 3306, 27017, 6379, 9200, 9300, 5672, 11211, 9000, 8123,
  1433, 9042, 7687, 8086, 2379, 5984, 6333]);
const PASSWORD_STORAGE_NAMES = /^(postgres|mysql|mariadb|mongo)$/i;
const NO_PASSWORD_STORAGE_NAMES = /^(redis|valkey|keydb|memcached)$/i;
const PROXY_NAMES = /^(caddy|nginx|traefik|haproxy|envoy|openresty)$/i;

const PASSWORD_STORAGE_EXPOSURE = 'хранилище опубликовано наружу: слабый или подобранный пароль '
  + 'вместе с возможностями сервера (например, COPY … TO PROGRAM) даёт путь к компрометации. '
  + 'Убрать ports: целиком и обращаться к сервису по имени в compose-сети; для доступа только с '
  + 'хоста привязать к 127.0.0.1/::1';
const NO_PASSWORD_STORAGE_EXPOSURE = 'хранилище опубликовано наружу: образ этого класса по умолчанию '
  + 'не требует пароля, поэтому публикация сразу даёт доступ без аутентификации. Убрать ports: '
  + 'целиком и обращаться к сервису по имени в compose-сети; для доступа только с хоста привязать '
  + 'к 127.0.0.1/::1';
const NEUTRAL_STORAGE_EXPOSURE = 'хранилище опубликовано наружу. Убрать ports: целиком, либо '
  + 'привязать к 127.0.0.1';

/** `mcr.microsoft.com/mssql/server:2022` → `server`; `postgres:16` → `postgres`. */
function imageName(image) {
  const noDigest = String(image || '').split('@')[0];
  const last = noDigest.split('/').pop() || '';
  return last.split(':')[0];
}
/** The whole path matters too: mssql/server names the engine one component up. */
function imageParts(image) {
  const parts = String(image || '').split('@')[0].split('/').filter(Boolean);
  if (parts.length) parts[parts.length - 1] = parts[parts.length - 1].split(':')[0];
  return parts;
}

function say(s) { process.stdout.write(s + '\n'); }
function warn(s) { process.stderr.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint, stderr) {
  const write = stderr ? warn : say;
  write('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) write('    ' + hint);
  process.exit(2);
}

/**
 * Absolutise ONCE, at the boundary.
 *
 * The invariant this restores: one frame of reference per path. A relative `-f` handed to a
 * subprocess whose cwd we also override is resolved TWICE against two different origins, and the
 * directory component appears twice. Keeping the argument relative past this point is what made
 * `check-ports.cjs projects/01` report `.../projects/01/projects/01/docker-compose.yml`.
 *
 * Absolute from here on means the existence checks, the `-f` argument and the printed cure all name
 * the same object — so the cure REPRODUCES the failure instead of refuting it.
 */
function resolveCompose(arg) {
  const target = path.resolve(process.cwd(), arg || '.');
  let file = target;
  try {
    if (fs.statSync(target).isDirectory()) file = path.join(target, 'docker-compose.yml');
  } catch {
    cannotCheck('путь не существует: ' + target);
  }
  if (!fs.existsSync(file)) cannotCheck('нет файла ' + file);
  return file;
}

/** The normalised config. Parsing the raw YAML would re-implement `extends`, interpolation and the
 *  short `"5432:5432"` form — and the short form is exactly where a hand parser gets host_ip wrong. */
function normalisedConfig(file) {
  // NO cwd override — deliberately, and the deletion is the fix rather than a tidy-up.
  //
  // It used to be `cwd: path.dirname(path.resolve(file))`, which is how the doubling happened: `-f`
  // was relative and got re-resolved against the cwd this very option installed. Absolutising `file`
  // alone would have made the line harmless while leaving the false premise that compose needs its
  // cwd set — and the next relative path added here would reopen the class.
  //
  // MEASURED (Compose v5.1.1), same absolute -f from two different cwds, byte-identical output:
  //   project name        -> from the file's directory, not cwd
  //   build: ./app        -> context resolved under the file's directory
  //   .env discovery      -> the project-dir .env won; the cwd's .env was NOT even a fallback
  //   env_file: ./x.env   -> compose still demanded the project-dir copy
  // All three candidate justifications are project-directory-derived, and the project directory
  // comes from the -f path. Scoped honestly: this is Compose v2+ semantics; v1 differed.
  const r = spawnSync('docker', ['compose', '-f', file, 'config'], SUBPROCESS_OPTIONS);
  if (r.error && r.error.code === 'ENOENT') {
    cannotCheck('docker недоступен на этой машине',
      'без него нормализованный конфиг получить нечем, а разбирать YAML руками — значит ошибиться на короткой форме портов');
  }
  if (r.status !== 0) {
    // Report, do not guess. The old hint said "обычно это незаданная переменная" — a cause that
    // CANNOT produce this exit: a plain unset ${VAR} makes `docker compose config` exit 0 with a
    // warning; only the required form ${VAR:?msg} exits 1. It named a subset of an already-narrow
    // class while the actual cause was this checker's own invocation.
    //
    // And the cure now carries the ABSOLUTE path actually passed. It used to print the relative form
    // without the cwd override — i.e. the invocation that SUCCEEDS — so the tool handed the user a
    // reproducer that refuted it.
    const why = String(r.stderr || '').trim().split('\n')[0] || 'причина неизвестна';
    cannotCheck('docker compose config вернул ошибку: ' + why,
      'повторить ровно то, что делали мы: docker compose -f ' + file + ' config');
  }
  return String(r.stdout || '');
}

/**
 * Services with what this check needs.
 *
 * The parser must know WHICH FIELD it is inside. A first version started a port record at every YAML
 * sequence item and matched `published:` anywhere on a line, so this file — a perfectly legal one —
 * reported a violation that does not exist:
 *
 *     services:
 *       db:
 *         image: postgres:16
 *         command:
 *           - postgres
 *           - -c
 *           - "log_line_prefix=published: 6543"
 *
 * A check that invents violations is worse than one that misses them: it teaches people to ignore it.
 * So: indentation decides the service, the field under a service is tracked by name, and only inside
 * `ports:` does a sequence item begin a port record. Every field pattern is anchored to the start of
 * the line.
 */
function parseServices(yaml) {
  const services = [];
  let cur = null;
  let inServices = false;
  let field = '';          // the service-level key we are inside right now
  let fieldIndent = 0;
  let port = null;

  const flush = () => { if (port && cur) { cur.ports.push(port); } port = null; };

  for (const raw of yaml.split('\n')) {
    if (/^services:\s*$/.test(raw)) { inServices = true; continue; }
    if (/^\S/.test(raw)) { flush(); inServices = /^services:/.test(raw); cur = null; field = ''; continue; }
    if (!inServices || !raw.trim()) continue;

    const indent = raw.length - raw.replace(/^\s+/, '').length;

    const svc = raw.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
    if (svc) {
      flush();
      cur = {
        name: svc[1], image: '', networkMode: '', ports: [], commandText: '', environmentText: '',
        volumeText: '', hasVolumes: false, hasBuild: false,
      };
      services.push(cur);
      field = ''; fieldIndent = 0;
      continue;
    }
    if (!cur) continue;

    // A service-level key: `    image:`, `    ports:`, `    command:` …
    const key = raw.match(/^ {4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (key) {
      flush();
      field = key[1];
      fieldIndent = indent;
      if (field === 'image') cur.image = key[2].trim();
      if (field === 'network_mode') cur.networkMode = key[2].trim().replace(/^"|"$/g, '');
      if (field === 'command') cur.commandText += '\n' + key[2].trim();
      if (field === 'environment') cur.environmentText += '\n' + key[2].trim();
      if (field === 'volumes' && key[2].trim() && !/^\[\s*\]$/.test(key[2].trim())) {
        cur.hasVolumes = true;
        cur.volumeText += ' ' + key[2].trim();
      }
      if (field === 'build') cur.hasBuild = true;
      continue;
    }
    if (indent <= fieldIndent && field) { /* still inside the same field's block */ }

    if (field === 'command') cur.commandText += '\n' + raw.trim();
    if (field === 'environment') cur.environmentText += '\n' + raw.trim();
    if (field === 'volumes' && raw.trim()) {
      cur.hasVolumes = true;
      cur.volumeText += ' ' + raw.trim();
    }

    // Only inside `ports:` does a sequence item mean anything to this check. Under `command:`,
    // `environment:` or `labels:` a line may contain any text at all, including the word published.
    if (field !== 'ports') continue;

    if (/^\s+-\s/.test(raw)) { flush(); port = { hostIp: '', published: '', target: '' }; }
    if (!port) continue;
    const hip = raw.match(/^\s+host_ip:\s*"?([^"\s]+)"?\s*$/);
    if (hip) { port.hostIp = hip[1]; continue; }
    const pub = raw.match(/^\s+published:\s*"?([^"\s]+)"?\s*$/);
    if (pub) { port.published = pub[1]; continue; }
    const tgt = raw.match(/^\s+target:\s*"?([0-9]+)"?\s*$/);
    if (tgt) { port.target = tgt[1]; continue; }
    // The short form survives normalisation in some versions: `- "127.0.0.1:55432:5432"`.
    const short = raw.match(/^\s+-\s+"?(?:(\[?[0-9a-fA-F.:]+\]?):)?([0-9]+):([0-9]+)"?\s*$/);
    if (short) { port.hostIp = short[1] || ''; port.published = short[2]; port.target = short[3]; }
  }
  flush();
  return services;
}

const isLoopback = (hostIp) => {
  const address = String(hostIp || '').replace(/^\[|\]$/g, '');
  return (net.isIP(address) === 4 && Number(address.split('.')[0]) === 127) || address === '::1';
};
const isStorageImage = (image) => imageParts(image).some((part) => STORAGE_NAMES.test(part));
const isStorage = (svc) =>
  isStorageImage(svc.image) || svc.ports.some((p) => STORAGE_PORT.has(Number(p.target)));
const isProxy = (svc) => imageParts(svc.image).some((part) => PROXY_NAMES.test(part));

function unrecognizedServiceText(svc) {
  const publicPorts = svc.ports
    .filter((port) => port.published && !isLoopback(port.hostIp))
    .map((port) => port.published);
  const surfaces = [];
  if (svc.networkMode === 'host') surfaces.push('network_mode: host');
  if (publicPorts.length === 1) surfaces.push('порт ' + publicPorts[0] + ' наружу');
  if (publicPorts.length > 1) surfaces.push('порты ' + publicPorts.join(', ') + ' наружу');
  return svc.name + (surfaces.length ? ' (' + surfaces.join('; ') + ')' : '');
}

function catalogScopeText(services, storage, proxies) {
  const unrecognized = services.filter((svc) => !isStorage(svc) && !isProxy(svc));
  const counts = 'из ' + services.length + ' сервисов распознано хранилищ ' + storage.length
    + ', reverse-proxy ' + proxies.length;
  if (!unrecognized.length) return counts + '; все сервисы распознаны в этой области проверки';
  return counts + '; НЕ распознаны и не проверялись: '
    + unrecognized.map(unrecognizedServiceText).join(', ');
}

function storageExposureMessage(image) {
  const name = imageName(image);
  if (NO_PASSWORD_STORAGE_NAMES.test(name)) {
    return NO_PASSWORD_STORAGE_EXPOSURE;
  }
  if (PASSWORD_STORAGE_NAMES.test(name)) return PASSWORD_STORAGE_EXPOSURE;
  return NEUTRAL_STORAGE_EXPOSURE;
}

function cacheEngine(image) {
  const name = imageName(image).toLowerCase();
  return name === 'redis' || name === 'memcached' ? name : '';
}

function semanticValue(value) {
  const text = String(value || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  return text && !/^(?:null|~)$/i.test(text) ? text : '';
}

function hasPasswordEnvironment(environmentText) {
  for (const raw of String(environmentText || '').split('\n')) {
    const line = raw.trim().replace(/^-\s+/, '');
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (!/(?:PASSWORD|PASSWD)/i.test(key)) continue;
    if (/(?:ALLOW_EMPTY|EMPTY_PASSWORD|PASSWORDLESS|NO_AUTH|AUTH_DISABLED|DISABLE_AUTH)/i.test(key)) {
      continue;
    }
    if (semanticValue(match[2])) return true;
  }
  return false;
}

function commandTokens(commandText) {
  return String(commandText || '').split('\n').flatMap((raw) => {
    const line = raw.trim().replace(/^-\s+/, '');
    return line ? (line.match(/[^\s=]+=(?:"[^"]*"|'[^']*')|"[^"]*"|'[^']*'|[^\s]+/g) || []) : [];
  });
}

function visibleAuth(commandText, environmentText, engine) {
  const tokens = commandTokens(commandText);
  if (tokens.some((token, index) => {
    const assigned = token.match(/^--requirepass=(.*)$/i);
    if (assigned) return Boolean(semanticValue(assigned[1]));
    return token.toLowerCase() === '--requirepass' && tokens[index + 1]
      && !tokens[index + 1].startsWith('-') && Boolean(semanticValue(tokens[index + 1]));
  })) return true;
  if (engine === 'memcached' && tokens.includes('-S')) return true;
  return hasPasswordEnvironment(environmentText);
}

function catalogAuthState(svc) {
  const engine = cacheEngine(svc.image);
  if (!engine) return null;
  if (visibleAuth(svc.commandText, svc.environmentText, engine)) return 'authenticated';
  const targets = [...svc.volumeText.matchAll(/(?:^|\s)target:\s*([^\s]+)/gi)]
    .map((match) => match[1].replace(/^"|"$/g, ''));
  const onlyDataMounts = svc.hasVolumes && targets.length > 0
    && targets.every((target) => target === '/data' || target.startsWith('/data/'));
  const parts = imageParts(svc.image).map((part) => part.toLowerCase());
  const officialLibrary = (parts.length === 2 && parts[0] === 'library' && parts[1] === engine)
    || (parts.length === 3
      && /^(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)$/.test(parts[0])
      && parts[1] === 'library' && parts[2] === engine);
  const derivedImage = parts.length > 1 && !officialLibrary;
  if ((svc.hasVolumes && !onlyDataMounts) || svc.hasBuild || derivedImage) return 'indeterminate';
  return 'unauthenticated';
}

function printViolations(messages) {
  if (!messages.length) return;
  say('❌ Правило №0 нарушено (.claude/rules/docker-ports.md):');
  for (const message of messages) say('   • ' + message);
}

function checkCatalog(arg) {
  const file = resolveCompose(arg);
  const services = parseServices(normalisedConfig(file));
  if (!services.length) {
    cannotCheck('в нормализованном конфиге не нашлось ни одного сервиса',
      'разбор мог не совпасть с форматом вывода вашей версии docker — это не «нарушений нет»');
  }

  const bad = [];
  const unknown = [];
  const storage = services.filter(isStorage);
  const proxies = services.filter(isProxy);

  for (const svc of services) {
    // network_mode: host publishes everything the container listens on, with no ports: entry at all.
    // The rule forbids it for storage; the script this was rewritten from never checked it.
    if (isStorage(svc) && svc.networkMode === 'host') {
      bad.push(svc.name + ': network_mode: host — контейнер слушает прямо на хосте, публикации не '
        + 'видно, а порт наружу. Хранилищу этот режим не подходит');
    }
    if (!isStorage(svc)) continue;
    for (const p of svc.ports) {
      if (!p.published) continue;
      if (isLoopback(p.hostIp)) continue;   // the loopback exception IS part of the rule
      bad.push(svc.name + ': порт ' + p.published + ' → ' + (p.target || '?')
        + (p.hostIp ? ' (host_ip ' + p.hostIp + ')' : ' (без адреса — значит все интерфейсы)')
        + ' — ' + storageExposureMessage(svc.image));
    }

    const published = svc.ports.filter((p) => p.published);
    const loopbackCacheException = cacheEngine(svc.image) && published.length > 0
      && published.every((p) => isLoopback(p.hostIp)) && svc.networkMode !== 'host';
    if (!loopbackCacheException) {
      const auth = catalogAuthState(svc);
      if (auth === 'unauthenticated') {
        bad.push(svc.name + ': cache-no-auth — конфиг положительно показывает отсутствие '
          + 'аутентификации; задайте пароль в command/environment');
      } else if (auth === 'indeterminate') {
        unknown.push(svc.name + ': auth config не виден полностью из-за volume/custom build');
      }
    }
  }

  // Behind a reverse-proxy the proxy is the only door; anything published beside it can be reached
  // directly, bypassing everything the proxy guarantees.
  if (proxies.length) {
    for (const svc of services) {
      if (isProxy(svc)) continue;
      const pub = svc.ports.filter((p) => p.published && !isLoopback(p.hostIp));
      if (pub.length) {
        bad.push(svc.name + ': публикуется рядом с reverse-proxy ('
          + proxies.map((p) => p.name).join(', ') + ') — прокси обходится прямым обращением');
      }
    }
  }

  printViolations(bad);
  if (unknown.length) {
    for (const reason of unknown) warn('⚠️  проверка НЕ выполнена: ' + reason);
    process.exit(2);
  }
  if (bad.length) process.exit(1);
  say('✅ каталог ' + file + ' проверен в заявленной области: '
    + catalogScopeText(services, storage, proxies));
  process.exit(0);
}

const UNSAFE_TERMINAL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_TERMINAL_GLOBAL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;

function terminalText(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(UNSAFE_TERMINAL_GLOBAL, ' ').slice(0, 160);
}

function trustedLabel(value) {
  const text = String(value || '').trim();
  if (!text || UNSAFE_TERMINAL.test(text)) return 'unknown';
  return text.slice(0, 160);
}

function ownerText(labels) {
  const source = labels && typeof labels === 'object' ? labels : {};
  const project = trustedLabel(source['com.docker.compose.project']);
  const configFiles = trustedLabel(source['com.docker.compose.project.config_files']);
  if (project === 'unknown') return 'unknown owner';
  return 'owner ' + project + (configFiles === 'unknown' ? '' : ' (' + configFiles + ')');
}

function dockerCall(args) {
  const result = spawnSync('docker', args, SUBPROCESS_OPTIONS);
  const operation = 'docker ' + args[0];
  if (result.error) {
    if (result.error.code === 'ENOENT') return { ok: false, reason: 'docker недоступен' };
    if (result.error.code === 'ETIMEDOUT') {
      return { ok: false, reason: operation + ' превысил timeout ' + SUBPROCESS_TIMEOUT_MS + 'ms' };
    }
    return { ok: false, reason: operation + ' не удалось запустить' };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: operation + ' завершился с кодом ' + result.status,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
    };
  }
  return { ok: true, stdout: String(result.stdout || '') };
}

function cannotFinding(reason) {
  return { state: 'cannot-check', kind: 'cannot-check', message: reason };
}

function violationFinding(kind, message) {
  return { state: 'violation', kind, message };
}

function parseInventory(stdout, findings) {
  const rows = [];
  for (const line of String(stdout || '').split('\n').filter((item) => item.trim())) {
    let row;
    try { row = JSON.parse(line); } catch { findings.push(cannotFinding('docker ps вернул malformed JSON')); continue; }
    const id = String(row.ID || '');
    if (!/^[a-f0-9]{12,64}$/i.test(id) || !String(row.Image || '').trim()) {
      findings.push(cannotFinding('docker ps вернул неполную запись контейнера'));
      continue;
    }
    rows.push({ id, image: String(row.Image), name: terminalText(row.Names, id.slice(0, 12)) });
  }
  return rows;
}

function addExposureFindings(detail, row, owner, findings) {
  const name = terminalText(String(detail.Name || '').replace(/^\//, ''), row.name);
  const networkMode = detail.HostConfig.NetworkMode;
  if (networkMode === 'host') {
    findings.push(violationFinding('host-network', name + ' — ' + owner
      + ': host-network / network_mode: host публикует хранилище через сеть хоста'));
    return;
  }
  const ports = detail.NetworkSettings.Ports || {};
  for (const [target, bindings] of Object.entries(ports)) {
    if (bindings === null) continue;
    if (!Array.isArray(bindings) || bindings.length === 0) {
      findings.push(cannotFinding(name + ': docker inspect вернул malformed bindings для '
        + terminalText(target, '?')));
      continue;
    }
    for (const binding of bindings) {
      if (!binding || typeof binding !== 'object' || typeof binding.HostIp !== 'string'
        || typeof binding.HostPort !== 'string' || !/^\d+$/.test(binding.HostPort)) {
        findings.push(cannotFinding(name + ': docker inspect вернул неполную публикацию '
          + terminalText(target, '?')));
        continue;
      }
      const hostIp = binding.HostIp;
      if (isLoopback(hostIp)) continue;
      findings.push(violationFinding('storage-exposure', name + ' — ' + owner + ': storage-exposure '
        + terminalText(binding.HostPort, '?') + ' → ' + terminalText(target, '?') + ' на '
        + terminalText(hostIp, 'всех интерфейсах') + '; убрать публикацию или привязать loopback'));
    }
  }
}

function probeRedis(detail, row, owner, findings, totals) {
  totals.authProbes += 1;
  const probe = dockerCall(['exec', row.id, 'redis-cli', '--raw', 'CONFIG', 'GET', 'requirepass']);
  if (/^NOAUTH\b/im.test(String(probe.stdout || '') + '\n' + String(probe.stderr || ''))) return;
  if (!probe.ok) {
    findings.push(cannotFinding(terminalText(detail.Name, row.name)
      + ': Redis runtime auth probe не завершён (' + probe.reason + ')'));
    return;
  }
  const lines = probe.stdout.replace(/\r/g, '').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const first = String(lines[0] || '').trim();
  if (/^NOAUTH\b/i.test(first)) return;
  if (first.toLowerCase() === 'requirepass') {
    const hasPassword = lines.slice(1).join('\n').trim().length > 0;
    if (!hasPassword) {
      findings.push(violationFinding('live-cache-no-auth', terminalText(detail.Name, row.name)
        + ' — ' + owner + ': live-cache-no-auth — живой Redis отвечает без аутентификации'));
    }
    return;
  }
  findings.push(cannotFinding(terminalText(detail.Name, row.name)
    + ': Redis runtime auth probe вернул нераспознанный ответ'));
}

function inspectAuth(detail, row, owner, findings, totals) {
  const engine = cacheEngine(row.image);
  if (!engine) return;
  if (engine === 'redis') {
    probeRedis(detail, row, owner, findings, totals);
    return;
  }
  const commandText = Array.isArray(detail.Config.Cmd)
    ? detail.Config.Cmd.join('\n') : String(detail.Config.Cmd || '');
  const environmentText = Array.isArray(detail.Config.Env) ? detail.Config.Env.join('\n') : '';
  if (visibleAuth(commandText, environmentText, engine)) return;
  const onlyDataMounts = detail.Mounts.length > 0 && detail.Mounts.every((mount) => {
    const target = String(mount && mount.Destination || '');
    return target === '/data' || target.startsWith('/data/');
  });
  if (detail.Mounts.length && !onlyDataMounts) {
    findings.push(cannotFinding(terminalText(detail.Name, row.name)
      + ': Memcached auth config может находиться в mount'));
    return;
  }
  findings.push(violationFinding('live-cache-no-auth', terminalText(detail.Name, row.name)
    + ' — ' + owner + ': live-cache-no-auth — runtime metadata показывает отсутствие аутентификации'));
}

function validInspect(detail) {
  return detail && typeof detail === 'object'
    && /^[a-f0-9]{12,64}$/i.test(String(detail.Id || ''))
    && detail.Config && typeof detail.Config === 'object'
    && detail.HostConfig && typeof detail.HostConfig.NetworkMode === 'string'
    && (detail.Config.Cmd === null
      || (Array.isArray(detail.Config.Cmd)
        && detail.Config.Cmd.every((item) => typeof item === 'string')))
    && (detail.Config.Env === null
      || (Array.isArray(detail.Config.Env)
        && detail.Config.Env.every((item) => typeof item === 'string')))
    && detail.NetworkSettings && Object.prototype.hasOwnProperty.call(detail.NetworkSettings, 'Ports')
    && (detail.NetworkSettings.Ports === null
      || (typeof detail.NetworkSettings.Ports === 'object'
        && !Array.isArray(detail.NetworkSettings.Ports)))
    && Array.isArray(detail.Mounts);
}

function hasPublishedSurface(detail) {
  if (detail.HostConfig.NetworkMode === 'host') return true;
  return Object.values(detail.NetworkSettings.Ports || {})
    .some((bindings) => Array.isArray(bindings) && bindings.length > 0);
}

function reportMachine(findings, totals) {
  const unique = [];
  const seen = new Set();
  for (const finding of findings) {
    const key = finding.state + '|' + finding.kind + '|' + finding.message;
    if (!seen.has(key)) { seen.add(key); unique.push(finding); }
  }
  unique.sort((a, b) => a.message.localeCompare(b.message));
  const violations = unique.filter((finding) => finding.state === 'violation');
  const unknown = unique.filter((finding) => finding.state === 'cannot-check');
  printViolations(violations.map((finding) => '[' + finding.kind + '] ' + finding.message));
  for (const finding of unknown) warn('⚠️  проверка НЕ выполнена: ' + finding.message);
  if (unknown.length) process.exit(2);
  if (violations.length) process.exit(1);
  say('✅ снимок текущего Docker-контекста проверен: running_containers=' + totals.running
    + ', storage_observed=' + totals.storage + ', auth_probes=' + totals.authProbes
    + '; среди распознанных запущенных хранилищ нарушений не найдено');
  process.exit(0);
}

function checkMachine() {
  const findings = [];
  const totals = { running: 0, storage: 0, authProbes: 0 };
  const inventoryResult = dockerCall(['ps', '--no-trunc', '--format', '{{json .}}']);
  if (!inventoryResult.ok) reportMachine([cannotFinding(inventoryResult.reason)], totals);
  const inventory = parseInventory(inventoryResult.stdout, findings);
  totals.running = inventory.length;
  const storageRows = inventory.filter((row) => isStorageImage(row.image));
  totals.storage = storageRows.length;
  if (!storageRows.length) reportMachine(findings, totals);

  const inspectResult = dockerCall(['inspect'].concat(storageRows.map((row) => row.id)));
  if (!inspectResult.ok) {
    findings.push(cannotFinding(inspectResult.reason));
    reportMachine(findings, totals);
  }
  let details;
  try { details = JSON.parse(inspectResult.stdout); } catch { details = null; }
  if (!Array.isArray(details)) {
    findings.push(cannotFinding('docker inspect вернул malformed JSON'));
    reportMachine(findings, totals);
  }
  const byId = new Map();
  for (const detail of details) {
    if (!validInspect(detail)) {
      findings.push(cannotFinding('docker inspect вернул неполную запись контейнера'));
      continue;
    }
    byId.set(String(detail.Id), detail);
  }
  for (const row of storageRows) {
    const detail = byId.get(row.id);
    if (!detail) {
      findings.push(cannotFinding(row.name + ': docker inspect не вернул обязательную запись'));
      continue;
    }
    const owner = ownerText(detail.Config.Labels);
    addExposureFindings(detail, row, owner, findings);
    if (hasPublishedSurface(detail)) inspectAuth(detail, row, owner, findings, totals);
  }
  reportMachine(findings, totals);
}

function usageError() {
  cannotCheck('неоднозначные аргументы; использование: check-ports.cjs [project|compose] | --machine',
    'режим --machine не принимает дополнительных аргументов', true);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--machine') {
    if (args.length !== 1) usageError();
    return checkMachine();
  }
  if (args.length > 1 || (args[0] && args[0].startsWith('-'))) usageError();
  return checkCatalog(args[0]);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err), null,
    process.argv[2] === '--machine');
}
