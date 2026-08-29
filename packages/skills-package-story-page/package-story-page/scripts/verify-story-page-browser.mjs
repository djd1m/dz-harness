#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function args(argv) {
  const value = (name) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : null; };
  return {
    site: value('site'),
    widths: (value('widths') ?? '320,390,768,1440').split(',').map(Number),
  };
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error('could not reserve a local WebDriver port');
  return port;
}

async function serveSite(sitePath, probeUrl) {
  const html = readFileSync(resolve(sitePath));
  const http = createHttpServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/proxy-probe') {
      const harness = `<!doctype html><meta charset="utf-8"><img alt="proxy probe" src="${probeUrl}">`;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(harness) });
      response.end(harness);
      return;
    }
    if (requestUrl.pathname === '/story') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length });
      response.end(html);
      return;
    }
    if (requestUrl.pathname !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    const width = Number(requestUrl.searchParams.get('width'));
    if (!Number.isInteger(width) || width < 240 || width > 4096) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('invalid width');
      return;
    }
    const harness = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0}iframe{display:block;width:${width}px;height:10000px;border:0}</style><iframe title="story viewport" src="/story"></iframe>`;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(harness) });
    response.end(harness);
  });
  await new Promise((resolveListen, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolveListen);
  });
  const address = http.address();
  if (typeof address !== 'object' || !address) throw new Error('could not start the local story-page server');
  return { server: http, url: `http://127.0.0.1:${address.port}/` };
}

const knownProbeTargets = new WeakSet();

export async function serveProbeTarget() {
  let hits = 0;
  const server = createHttpServer((_request, response) => {
    hits += 1;
    response.writeHead(204);
    response.end();
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('could not start proxy negative-control target');
  const target = Object.freeze({ server, url: `http://127.0.0.1:${address.port}/probe.png`, hits: () => hits });
  knownProbeTargets.add(target);
  return target;
}

export async function startRecordingProxy(storyOrigin) {
  const records = [];
  const proxy = createHttpServer((request, response) => {
    let target;
    try { target = new URL(request.url ?? '/', storyOrigin); }
    catch {
      response.writeHead(400); response.end('invalid proxy target'); return;
    }
    const record = { method: request.method ?? 'GET', url: target.href, origin: target.origin, connect: false };
    records.push(record);
    if (target.origin !== storyOrigin) {
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('blocked outside story origin');
      return;
    }
    const upstream = httpRequest(target, {
      method: request.method,
      headers: { ...request.headers, host: target.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.once('error', (error) => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
      response.end(`proxy upstream error: ${error.message}`);
    });
    request.pipe(upstream);
  });
  proxy.on('connect', (request, socket) => {
    let target;
    try { target = new URL(`https://${request.url ?? ''}`); }
    catch { target = null; }
    records.push({ method: 'CONNECT', url: target?.href ?? String(request.url), origin: target?.origin ?? null, connect: true });
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolveListen, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolveListen);
  });
  const address = proxy.address();
  if (typeof address !== 'object' || !address) throw new Error('could not start recording proxy');
  return {
    server: proxy,
    host: '127.0.0.1',
    port: address.port,
    records,
    clear: () => { records.splice(0, records.length); },
    authorizeRejectedOrigin: (probeTarget) => {
      if (typeof probeTarget !== 'object' || probeTarget === null || !knownProbeTargets.has(probeTarget)) {
        throw new Error('second-origin authorization requires the module-issued probe target');
      }
      const probeOrigin = new URL(probeTarget.url).origin;
      return issueSecondOriginReceipt(
        records.some((item) => item.origin === probeOrigin),
        probeTarget.hits(),
      );
    },
  };
}

async function webdriver(base, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.value?.error) {
    throw new Error(`WebDriver ${method} ${path}: ${payload?.value?.message ?? response.status}`);
  }
  return payload.value;
}

async function waitForDriver(base, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`geckodriver exited ${child.exitCode}`);
    try {
      await webdriver(base, '/status');
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error('geckodriver did not become ready');
}

async function execute(base, sessionId, script, args = []) {
  return webdriver(base, `/session/${sessionId}/execute/sync`, 'POST', { script, args });
}

async function setViewport(base, sessionId, width, height = 900) {
  const chrome = await execute(base, sessionId, 'return {x: window.outerWidth-window.innerWidth, y: window.outerHeight-window.innerHeight};');
  await webdriver(base, `/session/${sessionId}/window/rect`, 'POST', {
    width: width + Math.max(0, Number(chrome.x) || 0),
    height: height + Math.max(0, Number(chrome.y) || 0),
  });
  const measured = await execute(base, sessionId, 'return {width: window.innerWidth, height: window.innerHeight};');
  if (measured.width !== width) {
    const correction = width - measured.width;
    await webdriver(base, `/session/${sessionId}/window/rect`, 'POST', {
      width: width + Math.max(0, Number(chrome.x) || 0) + correction,
      height: height + Math.max(0, Number(chrome.y) || 0),
    });
  }
  return execute(base, sessionId, 'return {width: window.innerWidth, height: window.innerHeight};');
}

const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

async function keyboardReceipt(base, sessionId) {
  const summaries = await webdriver(base, `/session/${sessionId}/elements`, 'POST', { using: 'css selector', value: 'summary' });
  const links = await webdriver(base, `/session/${sessionId}/elements`, 'POST', { using: 'css selector', value: 'a[href]' });
  const keyboardFailures = [];
  const nameFailures = [];
  const receipts = [];
  for (const element of summaries) {
    const id = element[W3C_ELEMENT];
    const labelBefore = await webdriver(base, `/session/${sessionId}/element/${id}/computedlabel`).catch(() => '');
    const labelText = typeof labelBefore === 'string' ? labelBefore : '';
    if (labelText.trim() === '') nameFailures.push({ kind: 'summary', id, label: labelBefore });
    for (const key of ['\uE007', '\uE00D']) {
      const before = await execute(base, sessionId, 'const s=arguments[0];s.focus();return {open:s.parentElement.open,active:document.activeElement===s,text:s.textContent.trim()};', [element]);
      await webdriver(base, `/session/${sessionId}/element/${id}/value`, 'POST', { text: key, value: [key] });
      const after = await execute(base, sessionId, 'const s=arguments[0];return {open:s.parentElement.open,active:document.activeElement===s,text:s.textContent.trim()};', [element]);
      const labelAfter = await webdriver(base, `/session/${sessionId}/element/${id}/computedlabel`).catch(() => '');
      await webdriver(base, `/session/${sessionId}/element/${id}/value`, 'POST', { text: key, value: [key] });
      const restored = await execute(base, sessionId, 'const s=arguments[0];return {open:s.parentElement.open,active:document.activeElement===s,text:s.textContent.trim()};', [element]);
      const labelRestored = await webdriver(base, `/session/${sessionId}/element/${id}/computedlabel`).catch(() => '');
      const labelsStable = labelText.trim() !== '' && labelAfter === labelBefore && labelRestored === labelBefore;
      const pass = before.open !== after.open && Boolean(restored.open) === Boolean(before.open) && after.active && restored.active
        && after.text !== '' && labelsStable;
      const receipt = {
        id, key: key === '\uE007' ? 'Enter' : 'Space',
        labelBefore, labelAfter, labelRestored, before, after, restored, labelsStable, pass,
      };
      receipts.push(receipt);
      if (!pass) keyboardFailures.push(receipt);
    }
  }
  for (const element of links) {
    const id = element[W3C_ELEMENT];
    const label = await webdriver(base, `/session/${sessionId}/element/${id}/computedlabel`).catch(() => '');
    if (typeof label !== 'string' || label.trim() === '') nameFailures.push({ kind: 'link', id, label });
  }
  return { receipts, keyboardFailures, nameFailures };
}

export function classifyBrowserFailures(results) {
  return results.filter((result) => result.marker !== 'package-story-brief/1'
    || result.proxyProbeObserved !== true
    || result.cleanReadyState !== 'complete'
    || result.hostReadyState !== 'complete'
    || result.readyState !== 'complete'
    || result.innerWidth !== result.requestedWidth
    || result.clientWidth !== result.requestedWidth
    || result.scrollWidth > result.clientWidth
    || result.outliers.length > 0
    || result.overflowingContainers.length > 0
    || result.contrastFailures.length > 0
    || result.visibilityFailures.length > 0
    || result.fieldFailures.length > 0
    || result.focusFailure.length > 0
    || result.disclosureFailures.length > 0
    || result.keyboardFailures.length > 0
    || result.nameFailures.length > 0
    || result.externalRequestFailures.length > 0);
}

const authorizedSecondOriginReceipts = new WeakSet();

function issueSecondOriginReceipt(observed, hits) {
  if (observed !== true || hits !== 0) {
    throw new Error(observed !== true
      ? 'recording proxy did not observe the required second-origin negative control'
      : 'recording proxy forwarded the forbidden second-origin negative control');
  }
  const receipt = Object.freeze({ secondOriginRejected: true });
  authorizedSecondOriginReceipts.add(receipt);
  return receipt;
}

export function beginCanonicalMeasurements(receipt) {
  if (typeof receipt !== 'object' || receipt === null || !authorizedSecondOriginReceipts.has(receipt)) {
    throw new Error('canonical browser measurements require a module-issued second-origin rejection receipt');
  }
  return [];
}

export async function verifyBrowserLayout(sitePath, widths = [320, 390, 768, 1440]) {
  if (!widths.every((width) => Number.isInteger(width) && width >= 240 && width <= 4096)) {
    throw new Error('widths must be integers between 240 and 4096');
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.env.GECKODRIVER ?? 'geckodriver', ['--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MOZ_DISABLE_NONLOCAL_CONNECTIONS: '1' },
  });
  let driverLog = '';
  let childError = null;
  child.stdout.on('data', (chunk) => { driverLog += chunk; });
  child.stderr.on('data', (chunk) => { driverLog += chunk; });
  child.once('error', (error) => { childError = error; });
  let sessionId = null;
  let siteServer = null;
  let probeServer = null;
  let recordingProxy = null;
  try {
    await waitForDriver(base, child);
    if (childError) throw childError;
    probeServer = await serveProbeTarget();
    siteServer = await serveSite(sitePath, probeServer.url);
    const storyOrigin = new URL(siteServer.url).origin;
    recordingProxy = await startRecordingProxy(storyOrigin);
    const session = await webdriver(base, '/session', 'POST', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          'moz:firefoxOptions': {
            args: ['-headless'],
            prefs: {
              'network.proxy.type': 1,
              'network.proxy.http': recordingProxy.host,
              'network.proxy.http_port': recordingProxy.port,
              'network.proxy.ssl': recordingProxy.host,
              'network.proxy.ssl_port': recordingProxy.port,
              'network.proxy.no_proxies_on': '',
              'network.proxy.allow_hijacking_localhost': true,
              'network.dns.disablePrefetch': true,
              'network.prefetch-next': false,
              'network.http.speculative-parallel-limit': 0,
              'network.captive-portal-service.enabled': false,
              'network.connectivity-service.enabled': false,
              'browser.search.suggest.enabled': false,
              'browser.safebrowsing.downloads.enabled': false,
              'browser.safebrowsing.malware.enabled': false,
              'browser.safebrowsing.phishing.enabled': false,
              'extensions.blocklist.enabled': false,
              'extensions.systemAddon.update.enabled': false,
              'app.normandy.enabled': false,
              'security.remote_settings.crlite_filters.enabled': false,
              'security.remote_settings.intermediates.enabled': false,
              'services.settings.server': `${storyOrigin}/remote-settings/v1`,
              'services.settings.poll_interval': 2147483647,
              'datareporting.healthreport.uploadEnabled': false,
            },
          },
        },
      },
    });
    sessionId = session.sessionId;
    recordingProxy.clear();
    await webdriver(base, `/session/${sessionId}/url`, 'POST', { url: `${siteServer.url}proxy-probe` });
    for (let attempt = 0; attempt < 40 && !recordingProxy.records.some((item) => item.origin === new URL(probeServer.url).origin); attempt += 1) await delay(50);
    const proxyProbeObserved = recordingProxy.records.some((item) => item.origin === new URL(probeServer.url).origin);
    const proxyProbeReceipt = recordingProxy.authorizeRejectedOrigin(probeServer);
    await webdriver(base, `/session/${sessionId}/url`, 'POST', { url: 'about:blank' });
    const blankReady = await execute(base, sessionId, 'return document.readyState;');
    if (blankReady !== 'complete') throw new Error(`clean navigation did not complete: ${blankReady}`);
    const results = beginCanonicalMeasurements(proxyProbeReceipt);
    for (const width of widths) {
      await webdriver(base, `/session/${sessionId}/url`, 'POST', { url: 'about:blank' });
      const cleanReadyState = await execute(base, sessionId, 'return document.readyState;');
      recordingProxy.clear();
      const hostViewport = await setViewport(base, sessionId, Math.max(500, width + 24));
      await webdriver(base, `/session/${sessionId}/url`, 'POST', { url: `${siteServer.url}?width=${width}` });
      const hostReadyState = await execute(base, sessionId, 'return document.readyState;');
      const frame = await webdriver(base, `/session/${sessionId}/element`, 'POST', { using: 'css selector', value: 'iframe' });
      await webdriver(base, `/session/${sessionId}/frame`, 'POST', { id: frame });
      const result = await execute(base, sessionId, `
        const root = document.documentElement;
        const body = document.body;
        const disclosures = [];
        const disclosureFailures = [];
        for (const details of document.querySelectorAll('details')) {
          const id = details.dataset.flowStep ?? details.dataset.sourceDisclosure ?? null;
          const summary = details.children[0] ?? null;
          const content = [...details.children].find((child) =>
            child.dataset.flowContent === id || child.dataset.sourceContent === id) ?? null;
          const summaryId = summary?.dataset.flowSummary ?? summary?.dataset.sourceSummary ?? null;
          const owned = details.tagName === 'DETAILS' && id !== null
            && summary?.tagName === 'SUMMARY' && summaryId === id
            && content !== null && content.parentElement === details;
          const initialOpen = details.open;
          if (summary?.tagName === 'SUMMARY') summary.click();
          const changedOpen = details.open;
          const toggled = changedOpen !== initialOpen;
          if (!changedOpen && summary?.tagName === 'SUMMARY') summary.click();
          const finalOpen = details.open;
          const contentStyle = content ? getComputedStyle(content) : null;
          const contentRect = content?.getBoundingClientRect() ?? null;
          const contentVisible = Boolean(finalOpen && contentStyle && contentRect
            && contentStyle.display !== 'none' && contentStyle.visibility !== 'hidden'
            && Number(contentStyle.opacity) !== 0 && contentRect.width > 0 && contentRect.height > 0);
          const receipt = { id, initialOpen, changedOpen, finalOpen, toggled, owned, contentVisible };
          disclosures.push(receipt);
          if (!owned || !toggled || !finalOpen || !contentVisible) disclosureFailures.push(receipt);
        }
        const rgb = (value) => {
          const parts = value.match(/[0-9.]+/g)?.map(Number) || [];
          return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
        };
        const luminance = ({ r, g, b }) => {
          const channel = (value) => {
            const normalized = value / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        const effectiveBackground = (element) => {
          for (let current = element; current; current = current.parentElement) {
            const color = rgb(getComputedStyle(current).backgroundColor);
            if (color.a >= 0.99) return color;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        };
        const contrastFailures = [...document.querySelectorAll('.flow-step summary,.example-zone .evidence,.dark .evidence,.dark .status,.example-zone .kicker,.dark .kicker,.visual-direction')].flatMap((element) => {
          const foreground = rgb(getComputedStyle(element).color);
          const background = effectiveBackground(element);
          const lighter = Math.max(luminance(foreground), luminance(background));
          const darker = Math.min(luminance(foreground), luminance(background));
          const ratio = (lighter + 0.05) / (darker + 0.05);
          return ratio < 4.5 ? [{ tag: element.tagName, className: String(element.className), ratio }] : [];
        });
        const visibilityFailures = [...document.querySelectorAll('.evidence,.status,[data-unknown-id],[data-synthetic-label],.example-zone .kicker,.dark .kicker,.visual-direction')].flatMap((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0
            ? [{ tag: element.tagName, className: String(element.className), display: style.display, visibility: style.visibility, opacity: style.opacity }]
            : [];
        });
        const fieldPaths = [...document.querySelectorAll('[data-story-field]')].map((element) => element.dataset.storyField);
        const fieldFailures = [...document.querySelectorAll('[data-story-field]')].flatMap((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const path = element.dataset.storyField ?? '';
          const duplicate = fieldPaths.filter((value) => value === path).length !== 1;
          return path === '' || duplicate || style.display === 'none' || style.visibility === 'hidden'
            || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0
            ? [{ path, duplicate, display: style.display, visibility: style.visibility, opacity: style.opacity, width: rect.width, height: rect.height }]
            : [];
        });
        const focusTargets = [...document.querySelectorAll('a[href],summary')];
        const focusFailure = focusTargets.flatMap((focusTarget) => {
          focusTarget.focus();
          const focusStyle = getComputedStyle(focusTarget);
          const focusColor = rgb(focusStyle.outlineColor);
          const focusBackground = effectiveBackground(focusTarget.parentElement);
          const focusRatio = (Math.max(luminance(focusColor), luminance(focusBackground)) + 0.05)
            / (Math.min(luminance(focusColor), luminance(focusBackground)) + 0.05);
          return focusStyle.outlineStyle === 'none' || Number.parseFloat(focusStyle.outlineWidth) < 2
            || focusColor.a === 0 || focusRatio < 3
            ? [{ tag: focusTarget.tagName, className: String(focusTarget.className), text: focusTarget.textContent.trim().slice(0, 80), outlineStyle: focusStyle.outlineStyle, outlineWidth: focusStyle.outlineWidth, outlineColor: focusStyle.outlineColor, ratio: focusRatio }]
            : [];
        });
        if (focusTargets.length === 0) focusFailure.push({ reason: 'no focus targets' });
        const outliers = [...document.querySelectorAll('body *')].flatMap((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === 'none' || rect.width === 0 || rect.height === 0) return [];
          return rect.left < -0.5 || rect.right > root.clientWidth + 0.5
            ? [{ tag: element.tagName, className: String(element.className).slice(0, 80), left: rect.left, right: rect.right }]
            : [];
        });
        const overflowingContainers = [...document.querySelectorAll('html,body,body *')].flatMap((element) => {
          const style = getComputedStyle(element);
          if (!['auto', 'scroll'].includes(style.overflowX)) return [];
          if (element.scrollWidth <= element.clientWidth + 0.5) return [];
          return [{
            tag: element.tagName,
            className: String(element.className).slice(0, 80),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }];
        }).slice(0, 20);
        return {
          marker: body.dataset.storySchema,
          language: document.documentElement.lang,
          readyState: document.readyState,
          innerWidth: window.innerWidth,
          clientWidth: root.clientWidth,
          scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
          outliers,
          overflowingContainers,
          contrastFailures,
          visibilityFailures,
          focusFailure,
          fieldPaths,
          fieldFailures,
          semanticReceipt: {
            headings: [...document.querySelectorAll('h1,h2,h3')].map((element) => ({ tag: element.tagName, text: element.textContent.trim() })),
            focusTargets: [...document.querySelectorAll('a[href],summary')].map((element) => ({
              tag: element.tagName,
              key: element.dataset.flowSummary ?? element.dataset.sourceSummary ?? null,
              text: element.textContent.trim(), href: element.getAttribute('href'),
            })),
            bodyText: body.innerText,
          },
          disclosures,
          disclosureFailures,
        };
      `);
      const keyboard = await keyboardReceipt(base, sessionId);
      await webdriver(base, `/session/${sessionId}/frame/parent`, 'POST', {});
      const externalRequestFailures = recordingProxy.records.filter((item) => item.origin !== storyOrigin);
      results.push({
        requestedWidth: width,
        hostViewport,
        cleanReadyState,
        hostReadyState,
        proxyProbeObserved,
        externalRequestFailures,
        keyboardReceipts: keyboard.receipts,
        keyboardFailures: keyboard.keyboardFailures,
        nameFailures: keyboard.nameFailures,
        ...result,
      });
    }
    const failures = classifyBrowserFailures(results);
    return { schema: 'package-story-browser-verification/1', pass: failures.length === 0, results, failures };
  } catch (error) {
    throw new Error(`${error.message}${driverLog ? `\ngeckodriver:\n${driverLog.slice(-4000)}` : ''}`);
  } finally {
    if (sessionId) await webdriver(base, `/session/${sessionId}`, 'DELETE').catch(() => {});
    if (siteServer) await new Promise((resolveClose) => siteServer.server.close(resolveClose));
    if (probeServer) await new Promise((resolveClose) => probeServer.server.close(resolveClose));
    if (recordingProxy) await new Promise((resolveClose) => recordingProxy.server.close(resolveClose));
    child.kill('SIGTERM');
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = args(argv);
  if (!options.site) throw new Error('usage: verify-story-page-browser --site <index.html> [--widths 320,390,768,1440]');
  const result = await verifyBrowserLayout(options.site, options.widths);
  if (!result.pass) throw new Error(JSON.stringify(result.failures));
  process.stdout.write(`PASS — ${result.results.length} browser viewport(s) have no horizontal overflow and retain visible AA evidence/status text.\n`);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main().catch((error) => { console.error(`verify-story-page-browser: ${error.message}`); process.exit(1); });
}
