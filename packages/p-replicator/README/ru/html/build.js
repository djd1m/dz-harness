#!/usr/bin/env node
'use strict';

/**
 * build.js — generates index.html from sibling .md files.
 *
 * Usage:  node build.js
 * Reads:  ../{README,01_quickstart,02_user_guide,...}.md
 * Writes: ./index.html
 *
 * Zero dependencies — uses only Node built-ins. Inlines a minimal
 * Markdown → HTML parser sufficient for the documentation features
 * actually used in our .md files.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_DIR = path.resolve(__dirname, '..');
const OUTPUT = path.join(__dirname, 'index.html');

const FILES = [
  { id: 'index',          source: 'README.md',           title: 'Главная',                 nav: 'Главная' },
  { id: 'quickstart',     source: '01_quickstart.md',    title: '01. Быстрый старт',       nav: '01. Быстрый старт' },
  { id: 'user-guide',     source: '02_user_guide.md',    title: '02. Руководство пользователя', nav: '02. Руководство' },
  { id: 'admin-guide',    source: '03_admin_guide.md',   title: '03. Admin Guide',         nav: '03. Admin Guide' },
  { id: 'api-reference',  source: '04_api_reference.md', title: '04. API Reference',       nav: '04. API Reference' },
  { id: 'architecture',   source: '05_architecture.md',  title: '05. Архитектура',         nav: '05. Архитектура' },
  { id: 'troubleshooting',source: '06_troubleshooting.md',title: '06. Troubleshooting',    nav: '06. Troubleshooting' },
  { id: 'changelog',      source: '07_changelog.md',     title: '07. Changelog',           nav: '07. Changelog' },
];

// ─── Cyrillic → Latin transliteration for slugs ────────────────────────────
const TRANS = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
  'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
  'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
  'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
};
function transliterate(s) {
  return s.toLowerCase().split('').map((c) => TRANS[c] !== undefined ? TRANS[c] : c).join('');
}
function slugify(text) {
  return transliterate(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ─── Section map: source filename → section id (built lazily after FILES) ─
const SECTION_MAP = new Map();
function buildSectionMap() {
  if (SECTION_MAP.size > 0) return;
  for (const f of FILES) {
    SECTION_MAP.set(f.source, f.id);
  }
}

// ─── Rewrite cross-section .md links to in-page anchors ──────────────────
// Returns rewritten URL, or null if URL should be left untouched.
function rewriteInternalLink(url) {
  // External / mailto / pure-anchor URLs — leave alone
  if (/^https?:/i.test(url) || /^mailto:/i.test(url) || url.startsWith('#')) {
    return null;
  }
  buildSectionMap();

  // Strip leading ./
  let p = url.startsWith('./') ? url.slice(2) : url;

  // Cross-language link to English README (no English HTML exists yet) → GitHub blob URL
  if (p.startsWith('../eng/')) {
    const tail = p.slice('../'.length); // "eng/README.md"
    return `https://github.com/djd1m/dz-harness-hub/blob/main/packages/@dzhechkov/p-replicator/README/${tail}`;
  }

  // Same-folder .md reference: "<filename>.md" or "<filename>.md#<fragment>"
  const m = p.match(/^([^#?]+\.md)(?:#(.*))?$/);
  if (!m) return null;

  const filename = m[1];
  const sectionId = SECTION_MAP.get(filename);
  if (!sectionId) {
    // .md file outside the section index (e.g., KNOWN_LIMITATIONS.md, CHANGELOG.md,
    // .claude/commands/replicate.md) — point at the GitHub source.
    if (filename.match(/^\.claude\//) || /^[A-Z_]+\.md$/.test(filename) || filename === 'CHANGELOG.md') {
      return `https://github.com/djd1m/dz-harness-hub/blob/main/packages/@dzhechkov/p-replicator/${p}`;
    }
    return null;
  }

  if (m[2]) {
    // Anchor present — fragment may be cyrillic; slugify to match heading id
    const fragment = decodeURIComponent(m[2]);
    const slug = slugify(fragment);
    return `#${sectionId}-${slug}`;
  }
  return `#${sectionId}`;
}

// ─── HTML escape ──────────────────────────────────────────────────────────
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

// ─── Inline markdown ──────────────────────────────────────────────────────
function processInline(text) {
  // 1. Stash inline code so its content isn't processed further
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(escapeHtml(c));
    return `\x00CODE${codes.length - 1}\x00`;
  });

  // 2. Stash links (so brackets aren't escaped)
  const links = [];
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    links.push({ label, url });
    return `\x00LINK${links.length - 1}\x00`;
  });

  // 3. Escape remaining HTML entities
  text = escapeHtml(text);

  // 4. Bold + italic + strikethrough on the escaped text
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 5. Restore links (label needs inline processing too — re-run bold/italic/code on it)
  text = text.replace(/\x00LINK(\d+)\x00/g, (_, idx) => {
    const { label, url } = links[idx];
    const safeLabel = escapeHtml(label)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Cross-section .md links → in-page anchors. External URLs stay as-is.
    const rewritten = rewriteInternalLink(url);
    const finalUrl = rewritten !== null ? rewritten : url;
    const isExternal = /^https?:/i.test(finalUrl);
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeAttr(finalUrl)}"${attrs}>${safeLabel}</a>`;
  });

  // 6. Restore code
  text = text.replace(/\x00CODE(\d+)\x00/g, (_, idx) => `<code>${codes[idx]}</code>`);

  return text;
}

// ─── Block parsers ────────────────────────────────────────────────────────
function renderTable(lines) {
  if (lines.length < 2) return '';
  const splitRow = (l) => l.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);

  let html = '<div class="table-wrap"><table><thead><tr>';
  for (const h of header) html += `<th>${processInline(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += `<td>${processInline(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function renderList(items, tag) {
  let html = `<${tag}>`;
  for (const item of items) {
    html += `<li>${processInline(item)}</li>`;
  }
  html += `</${tag}>`;
  return html;
}

function renderCode(code, lang) {
  return `<pre data-lang="${escapeAttr(lang)}"><code class="language-${escapeAttr(lang || 'text')}">${escapeHtml(code)}</code></pre>`;
}

// ─── Main parser ──────────────────────────────────────────────────────────
function parseMarkdown(md, idPrefix = '', usedIds = new Set()) {
  // Normalize line endings
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  function isBlockBoundary(line) {
    return (
      /^#{1,6}\s/.test(line) ||
      /^---+\s*$/.test(line) ||
      /^[-*+]\s+/.test(line) ||
      /^\d+\.\s+/.test(line) ||
      /^```/.test(line) ||
      /^\|/.test(line) ||
      /^>\s/.test(line) ||
      line.trim() === ''
    );
  }

  while (i < lines.length) {
    const line = lines[i];

    // ─── Code block (```)
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      out.push(renderCode(codeLines.join('\n'), lang));
      continue;
    }

    // ─── Heading
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const baseId = slugify(text);
      let id = idPrefix && level > 1 ? `${idPrefix}-${baseId}` : baseId || idPrefix || 'section';
      // P3: de-duplicate heading slugs (GitHub-style -2/-3 suffix) so duplicate headings never emit
      // duplicate `id` attributes (invalid HTML + hash-nav resolving only to the first occurrence).
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
      }
      usedIds.add(id);
      out.push(`<h${level} id="${escapeAttr(id)}">${processInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // ─── HR
    if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // ─── Blockquote
    if (/^>\s?/.test(line)) {
      const qLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseMarkdown(qLines.join('\n'), idPrefix, usedIds)}</blockquote>`);
      continue;
    }

    // ─── Table
    if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }

    // ─── Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
        // collect indented continuation lines into the previous item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].replace(/^\s+/, '');
          i++;
        }
      }
      out.push(renderList(items, 'ul'));
      continue;
    }

    // ─── Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].replace(/^\s+/, '');
          i++;
        }
      }
      out.push(renderList(items, 'ol'));
      continue;
    }

    // ─── Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ─── Paragraph (collect until block boundary)
    const para = [line];
    i++;
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${processInline(para.join(' ').replace(/\s+/g, ' ').trim())}</p>`);
  }

  return out.join('\n');
}

// ─── TOC extraction (h2 + h3) ─────────────────────────────────────────────
function extractToc(html) {
  const items = [];
  const re = /<h(2|3)\s+id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    items.push({
      level: parseInt(m[1], 10),
      id: m[2],
      // Strip any inline tags from the heading text for TOC display
      text: m[3].replace(/<[^>]+>/g, '').trim(),
    });
  }
  return items;
}

// ─── Build sidebar TOC ────────────────────────────────────────────────────
function renderSidebarToc(sections) {
  let html = '<ul>';
  for (const s of sections) {
    const subItems = (s.toc || []).filter((t) => t.level === 2);
    html += `<li><a href="#${escapeAttr(s.id)}" class="toc-section">${escapeHtml(s.nav)}</a>`;
    if (subItems.length > 0) {
      html += '<ul>';
      for (const sub of subItems.slice(0, 12)) {
        html += `<li><a href="#${escapeAttr(sub.id)}">${escapeHtml(sub.text)}</a></li>`;
      }
      html += '</ul>';
    }
    html += '</li>';
  }
  html += '</ul>';
  return html;
}

// ─── Render section nav (prev/next) ───────────────────────────────────────
function renderSectionNav(sections, idx) {
  const prev = idx > 0 ? sections[idx - 1] : null;
  const next = idx < sections.length - 1 ? sections[idx + 1] : null;
  let html = '<nav class="section-nav" aria-label="Навигация по секциям">';
  if (prev) {
    html += `<a href="#${escapeAttr(prev.id)}" class="prev"><span class="nav-arrow">←</span> <span class="nav-text"><span class="nav-label">Предыдущее</span><span class="nav-title">${escapeHtml(prev.nav)}</span></span></a>`;
  } else {
    html += '<span></span>';
  }
  if (next) {
    html += `<a href="#${escapeAttr(next.id)}" class="next"><span class="nav-text"><span class="nav-label">Далее</span><span class="nav-title">${escapeHtml(next.nav)}</span></span> <span class="nav-arrow">→</span></a>`;
  } else {
    html += '<span></span>';
  }
  html += '</nav>';
  return html;
}

// ─── Build sections HTML ──────────────────────────────────────────────────
function renderSection(s) {
  return `<article id="${escapeAttr(s.id)}" class="section" data-section-title="${escapeAttr(s.title)}">
${s.html}
${s.nav_html}
</article>`;
}

// ─── Read + parse all sources ─────────────────────────────────────────────
console.log('[build] Reading source files from', SOURCE_DIR);

const sections = FILES.map((f) => {
  const srcPath = path.join(SOURCE_DIR, f.source);
  const md = fs.readFileSync(srcPath, 'utf8');
  const html = parseMarkdown(md, f.id);
  return {
    ...f,
    html,
    toc: extractToc(html),
  };
});

console.log(`[build] Parsed ${sections.length} sections`);

// Add prev/next nav HTML to each section
sections.forEach((s, idx) => {
  s.nav_html = renderSectionNav(sections, idx);
});

// ─── Final HTML template ──────────────────────────────────────────────────
const tocHtml = renderSidebarToc(sections);
const sectionsHtml = sections.map(renderSection).join('\n');

const META_DESC = '@dzhechkov/p-replicator — toolkit для AI-assisted разработки в Claude Code (Vibe Coding). 11 slash-команд, 10 skills, hooks, statusline, --feature-branches workflow для обучения. v1.5.0.';
const META_KEYWORDS = 'p-replicator, claude code, vibe coding, sparc, ai-assisted, npm, dzhechkov, /replicate, /run, /feature, statusline, claude-code-toolkit, prd, sparc-mini, requirements-validator';

const STRUCTURED_DATA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  'headline': '@dzhechkov/p-replicator v1.5.0 — Документация',
  'description': META_DESC,
  'author': { '@type': 'Person', 'name': 'dzhechko' },
  'datePublished': '2026-05-07',
  'inLanguage': 'ru',
  'about': {
    '@type': 'SoftwareSourceCode',
    'name': '@dzhechkov/p-replicator',
    'codeRepository': 'https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator',
    'programmingLanguage': 'JavaScript',
    'softwareVersion': '1.5.0',
    'license': 'https://opensource.org/licenses/MIT',
  },
  'isPartOf': {
    '@type': 'WebSite',
    'name': '@dzhechkov/p-replicator Documentation',
    'url': 'https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator',
  },
}, null, 2);

const html = `<!DOCTYPE html>
<html lang="ru" data-theme="auto">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>@dzhechkov/p-replicator v1.5.0 — Документация</title>
<meta name="description" content="${escapeAttr(META_DESC)}">
<meta name="keywords" content="${escapeAttr(META_KEYWORDS)}">
<meta name="author" content="dzhechko">
<meta name="robots" content="index, follow">

<!-- Open Graph -->
<meta property="og:title" content="@dzhechkov/p-replicator v1.5.0">
<meta property="og:description" content="${escapeAttr(META_DESC)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="P-Replicator Docs">

<!-- Twitter -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="@dzhechkov/p-replicator v1.5.0">
<meta name="twitter:description" content="${escapeAttr(META_DESC)}">

<!-- Theme color (browser chrome) -->
<meta name="theme-color" content="#0969da" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">

<!-- Canonical -->
<link rel="canonical" href="https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator#readme">

<!-- Structured data -->
<script type="application/ld+json">${STRUCTURED_DATA}</script>

<!-- Inline critical CSS for instant first paint (avoid FOUC) -->
<script>
// Apply theme BEFORE first paint to prevent flash
(function() {
  try {
    var t = localStorage.getItem('p-replicator-theme') || 'auto';
    if (t !== 'auto') document.documentElement.setAttribute('data-theme', t);
  } catch (_) {}
})();
</script>

<link rel="stylesheet" href="style.css">
</head>
<body>
<a href="#main" class="skip-to-content">Перейти к содержимому</a>

<div class="progress-bar" id="progressBar" aria-hidden="true"></div>

<header class="site-header" role="banner">
  <button class="menu-toggle" id="menuToggle" aria-label="Открыть меню" aria-expanded="false">
    <span aria-hidden="true">☰</span>
  </button>
  <a href="#index" class="site-title">
    <strong>P-Replicator</strong>
    <span class="version">v1.5.0</span>
  </a>
  <nav class="header-nav" aria-label="Внешние ссылки">
    <a href="https://www.npmjs.com/package/@dzhechkov/p-replicator" target="_blank" rel="noopener noreferrer">npm</a>
    <a href="https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator" target="_blank" rel="noopener noreferrer">GitHub</a>
    <a href="https://t.me/llm_notes" target="_blank" rel="noopener noreferrer">Telegram</a>
  </nav>
  <button class="theme-toggle" id="themeToggle" aria-label="Переключить тему">
    <span aria-hidden="true">🌙</span>
  </button>
</header>

<div class="layout">
  <aside class="sidebar" id="sidebar" aria-label="Содержание">
    <div class="search-wrap">
      <input type="search" class="search-input" id="searchInput"
             placeholder="🔍 Поиск по документации"
             aria-label="Поиск по документации"
             autocomplete="off"
             spellcheck="false">
      <kbd class="search-kbd">/</kbd>
    </div>
    <div class="search-results" id="searchResults" role="listbox" hidden></div>
    <nav class="toc" id="toc" aria-label="Содержание документации">
      ${tocHtml}
    </nav>
  </aside>

  <main id="main" class="main-content" role="main">
    ${sectionsHtml}

    <footer class="site-footer">
      <div class="footer-row">
        <strong>@dzhechkov/p-replicator</strong> v1.5.0 · MIT License
      </div>
      <div class="footer-row footer-muted">
        Сгенерировано из <code>README/ru/*.md</code> командой <code>/docs</code>.
      </div>
      <div class="footer-row footer-muted">
        Re-build: <code>cd packages/p-replicator/README/ru/html &amp;&amp; node build.js</code>
      </div>
      <div class="footer-row footer-links">
        <a href="https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator" target="_blank" rel="noopener noreferrer">GitHub</a>
        ·
        <a href="https://www.npmjs.com/package/@dzhechkov/p-replicator" target="_blank" rel="noopener noreferrer">npm</a>
        ·
        <a href="https://t.me/llm_notes" target="_blank" rel="noopener noreferrer">Telegram</a>
      </div>
    </footer>
  </main>
</div>

<div class="sidebar-overlay" id="sidebarOverlay" aria-hidden="true"></div>

<button class="back-to-top" id="backToTop" aria-label="Наверх" hidden>
  <span aria-hidden="true">↑</span>
</button>

<script src="script.js"></script>
</body>
</html>
`;

// ─── Write output ─────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, html, 'utf8');
const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`[build] Wrote ${OUTPUT} (${sizeKb} KB, ${sections.length} sections)`);
console.log(`[build] Sections: ${sections.map((s) => s.id).join(', ')}`);
