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
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Storage recognised the way the rule names it — by image and by well-known port. Both lists live
// here, side by side, so a reader extending one can see the other.
// Recognition is a HEURISTIC and stays one — but it must not be a substring match. A substring
// called `rediscommander/redis-commander` storage (it is a web UI), and missed
// `mcr.microsoft.com/mssql/server` on its standard 1433 entirely. So: take the image NAME —
// the last path component, without registry, tag or digest — and anchor to it.
const STORAGE_NAMES = /^(postgres|postgresql|pgvector|mysql|mariadb|percona|mongo|mongodb|redis|valkey|keydb|elasticsearch|opensearch|minio|rabbitmq|memcached|clickhouse|cassandra|scylla|neo4j|influxdb|timescaledb|mssql|sqlserver|couchdb|etcd)$/i;
const STORAGE_PORT = new Set([5432, 3306, 27017, 6379, 9200, 9300, 5672, 11211, 9000, 8123,
  1433, 9042, 7687, 8086, 2379, 5984]);
const PROXY_NAMES = /^(caddy|nginx|traefik|haproxy|envoy)$/i;

/** `mcr.microsoft.com/mssql/server:2022` → `server`; `postgres:16` → `postgres`. */
function imageName(image) {
  const noDigest = String(image || '').split('@')[0];
  const last = noDigest.split('/').pop() || '';
  return last.split(':')[0];
}
/** The whole path matters too: mssql/server names the engine one component up. */
function imageParts(image) {
  const noDigest = String(image || '').split('@')[0].split(':')[0];
  return noDigest.split('/').filter(Boolean);
}

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
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
  const r = spawnSync('docker', ['compose', '-f', file, 'config'], { encoding: 'utf8' });
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
      cur = { name: svc[1], image: '', networkMode: '', ports: [] };
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
      continue;
    }
    if (indent <= fieldIndent && field) { /* still inside the same field's block */ }

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

const isLoopback = (hostIp) => /^127\./.test(hostIp) || hostIp === '::1' || hostIp === '[::1]';
const isStorage = (svc) =>
  imageParts(svc.image).some((part) => STORAGE_NAMES.test(part))
  || svc.ports.some((p) => STORAGE_PORT.has(Number(p.target)));
const isProxy = (svc) => imageParts(svc.image).some((part) => PROXY_NAMES.test(part));

function main() {
  const file = resolveCompose(process.argv[2]);
  const services = parseServices(normalisedConfig(file));
  if (!services.length) {
    cannotCheck('в нормализованном конфиге не нашлось ни одного сервиса',
      'разбор мог не совпасть с форматом вывода вашей версии docker — это не «нарушений нет»');
  }

  const bad = [];

  for (const svc of services) {
    // network_mode: host publishes everything the container listens on, with no ports: entry at all.
    // The rule forbids it for storage; the script this was rewritten from never checked it.
    if (isStorage(svc) && svc.networkMode === 'host') {
      bad.push(svc.name + ': network_mode: host — контейнер слушает прямо на хосте, публикации не '
        + 'видно, а порт наружу. Хранилищу этот режим не подходит');
      continue;
    }
    if (!isStorage(svc)) continue;
    for (const p of svc.ports) {
      if (!p.published) continue;
      if (isLoopback(p.hostIp)) continue;   // the loopback exception IS part of the rule
      bad.push(svc.name + ': порт ' + p.published + ' → ' + (p.target || '?')
        + (p.hostIp ? ' (host_ip ' + p.hostIp + ')' : ' (без адреса — значит все интерфейсы)')
        + ' — хранилище опубликовано наружу. Убрать ports: целиком, либо привязать к 127.0.0.1');
    }
  }

  // Behind a reverse-proxy the proxy is the only door; anything published beside it can be reached
  // directly, bypassing everything the proxy guarantees.
  const proxies = services.filter(isProxy);
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

  if (bad.length) {
    say('❌ Правило №0 нарушено (.claude/rules/docker-ports.md):');
    for (const b of bad) say('   • ' + b);
    process.exit(1);
  }
  say('✅ ни одно хранилище не публикует порт наружу, обходов reverse-proxy нет');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}
