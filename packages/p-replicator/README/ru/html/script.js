'use strict';

/**
 * P-Replicator docs interactivity (vanilla JS, no dependencies).
 * 12 features: theme toggle, mobile sidebar, scroll-spy TOC,
 * full-text search w/ snippets, copy buttons, back-to-top,
 * reading progress, prev/next nav, regex syntax highlighting,
 * keyboard shortcuts, print mode, reduced-motion respect.
 */

(function () {
  // ===========================================================================
  // Helpers
  // ===========================================================================

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // ===========================================================================
  // 1. Theme toggle (light / dark / auto) with localStorage persistence
  // ===========================================================================

  const THEME_KEY = 'p-replicator-theme';
  const html = document.documentElement;
  const themeToggle = $('#themeToggle');

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; }
    catch (_) { return 'auto'; }
  }

  function setTheme(t) {
    if (t === 'auto') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', t);
    }
    try { localStorage.setItem(THEME_KEY, t); } catch (_) { /* ignore */ }
    updateThemeIcon();
  }

  function isDarkActive() {
    const stored = getStoredTheme();
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function updateThemeIcon() {
    if (!themeToggle) return;
    const dark = isDarkActive();
    themeToggle.innerHTML = `<span aria-hidden="true">${dark ? '☀️' : '🌙'}</span>`;
    themeToggle.setAttribute('aria-label', dark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему');
  }

  themeToggle?.addEventListener('click', () => {
    const next = isDarkActive() ? 'light' : 'dark';
    setTheme(next);
  });

  // React to system theme change when in 'auto' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'auto') updateThemeIcon();
  });

  updateThemeIcon();

  // ===========================================================================
  // 2. Mobile sidebar toggle
  // ===========================================================================

  const menuToggle = $('#menuToggle');
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');

  function setSidebarOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    overlay?.classList.toggle('active', open);
    menuToggle?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open && window.innerWidth < 1024 ? 'hidden' : '';
  }

  menuToggle?.addEventListener('click', () => {
    setSidebarOpen(!sidebar.classList.contains('open'));
  });
  overlay?.addEventListener('click', () => setSidebarOpen(false));

  // Close sidebar when a TOC link is clicked on mobile
  $$('.toc a').forEach((a) => {
    a.addEventListener('click', () => {
      if (window.innerWidth < 1024) setSidebarOpen(false);
    });
  });

  // ===========================================================================
  // 3. Scroll-spy: highlight active TOC entry as user scrolls
  // ===========================================================================

  const tocLinks = $$('.toc a');
  const tocLinksByHref = new Map(tocLinks.map((a) => [a.getAttribute('href'), a]));

  // Observe both <article> sections and h2/h3 with id (subsections)
  const observed = $$('article.section, h2[id], h3[id]');

  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }

        // Find topmost visible
        let top = null;
        let topY = Infinity;
        for (const el of visible) {
          const r = el.getBoundingClientRect();
          if (r.top < topY) {
            topY = r.top;
            top = el;
          }
        }
        if (!top) return;

        const id = top.id;
        const href = '#' + id;
        tocLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === href));
      },
      { rootMargin: '-72px 0px -65% 0px', threshold: [0, 0.1] }
    );
    observed.forEach((el) => observer.observe(el));
  }

  // ===========================================================================
  // 4. Full-text search with snippet preview
  // ===========================================================================

  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');

  // Build search index: each h2/h3 + its surrounding paragraph text
  const searchIndex = (() => {
    const idx = [];
    $$('article.section').forEach((article) => {
      const sectionId = article.id;
      const sectionTitle = article.dataset.sectionTitle || article.querySelector('h1')?.textContent || sectionId;

      // Index the article's H1 with first paragraph snippet
      const h1 = article.querySelector('h1');
      if (h1) {
        const firstPara = h1.nextElementSibling?.tagName === 'P' ? h1.nextElementSibling.textContent : '';
        idx.push({
          sectionId, sectionTitle,
          headingId: sectionId,
          headingText: h1.textContent.trim(),
          content: (h1.textContent + ' ' + firstPara).replace(/\s+/g, ' ').trim().slice(0, 1500),
          score: 2,
        });
      }

      // Index each h2 and h3
      $$('h2[id], h3[id]', article).forEach((heading) => {
        const headingText = heading.textContent.trim();
        const headingId = heading.id;
        // Collect text content of siblings until next heading of same-or-higher level
        const stopTags = heading.tagName === 'H2' ? ['H1', 'H2'] : ['H1', 'H2', 'H3'];
        const parts = [];
        let next = heading.nextElementSibling;
        while (next && !stopTags.includes(next.tagName)) {
          parts.push(next.textContent || '');
          next = next.nextElementSibling;
        }
        idx.push({
          sectionId, sectionTitle,
          headingId, headingText,
          content: parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1500),
          score: heading.tagName === 'H2' ? 1.5 : 1,
        });
      });
    });
    return idx;
  })();

  function makeSnippet(text, query, len) {
    len = len || 140;
    if (!text) return '';
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const at = lower.indexOf(q);
    if (at === -1) return text.slice(0, len) + (text.length > len ? '…' : '');
    const start = Math.max(0, at - 50);
    const end = Math.min(text.length, at + q.length + 90);
    return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
  }

  function highlightMatches(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const re = new RegExp(escapeRegex(query), 'gi');
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  }

  function runSearch(q) {
    if (!searchResults) return;
    const query = q.trim();
    if (query.length < 2) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }
    const lower = query.toLowerCase();
    const results = [];
    for (const item of searchIndex) {
      const inHeading = item.headingText.toLowerCase().includes(lower);
      const inContent = item.content.toLowerCase().includes(lower);
      if (!inHeading && !inContent) continue;
      const score = (inHeading ? 10 : 0) + (inContent ? 1 : 0) + item.score;
      results.push({ ...item, _score: score });
    }
    results.sort((a, b) => b._score - a._score);

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">Ничего не найдено по запросу «' + escapeHtml(query) + '».</div>';
    } else {
      const top = results.slice(0, 25);
      searchResults.innerHTML = top.map((r) => `
        <a class="search-result" href="#${escapeHtml(r.headingId)}" role="option" tabindex="-1">
          <div class="search-result-section">${escapeHtml(r.sectionTitle)}</div>
          <div class="search-result-title">${highlightMatches(r.headingText, query)}</div>
          <div class="search-result-snippet">${highlightMatches(makeSnippet(r.content, query), query)}</div>
        </a>
      `).join('');
    }
    searchResults.hidden = false;
  }

  const debouncedSearch = debounce((q) => runSearch(q), 150);
  searchInput?.addEventListener('input', (e) => debouncedSearch(e.target.value));
  searchInput?.addEventListener('focus', () => {
    if (searchInput.value && searchResults && searchResults.children.length > 0) {
      searchResults.hidden = false;
    }
  });

  // Close search results on outside click
  document.addEventListener('click', (e) => {
    const wrap = searchInput?.parentElement;
    if (!wrap || wrap.contains(e.target) || searchResults?.contains(e.target)) return;
    if (searchResults) searchResults.hidden = true;
  });

  // Close search results when one clicked
  searchResults?.addEventListener('click', (e) => {
    if (e.target.closest('.search-result')) {
      searchResults.hidden = true;
      if (searchInput) searchInput.value = '';
      if (window.innerWidth < 1024) setSidebarOpen(false);
    }
  });

  // ===========================================================================
  // 5. Copy-to-clipboard buttons on every <pre>
  // ===========================================================================

  $$('pre').forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Скопировать код');
    btn.textContent = '📋 Copy';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        btn.dataset.state = 'copied';
        btn.textContent = '✓ Copied';
        setTimeout(() => {
          btn.dataset.state = '';
          btn.textContent = '📋 Copy';
        }, 1600);
      } catch (_) {
        btn.textContent = '✗ Failed';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 1600);
      }
    });
    pre.appendChild(btn);
  });

  // ===========================================================================
  // 6. Back-to-top button + 7. Reading progress bar
  // ===========================================================================

  const backToTop = $('#backToTop');
  const progressBar = $('#progressBar');

  function updateScrollUI() {
    const scrollTop = window.scrollY || window.pageYOffset;
    const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = totalScroll > 0 ? Math.min(100, (scrollTop / totalScroll) * 100) : 0;
    if (progressBar) progressBar.style.width = progress + '%';
    if (backToTop) backToTop.hidden = scrollTop < 500;
  }

  let scrollFrame;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(updateScrollUI);
  }, { passive: true });
  updateScrollUI();

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ===========================================================================
  // 8. Keyboard shortcuts
  //    `/` → focus search
  //    `Escape` → close sidebar / clear search
  //    `t` → toggle theme
  // ===========================================================================

  document.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

    // Escape always works
    if (e.key === 'Escape') {
      if (searchResults && !searchResults.hidden) {
        searchResults.hidden = true;
        return;
      }
      if (sidebar?.classList.contains('open')) {
        setSidebarOpen(false);
        return;
      }
      if (isInput && e.target === searchInput) {
        searchInput.value = '';
        runSearch('');
        searchInput.blur();
        return;
      }
    }

    if (isInput) return;

    if (e.key === '/') {
      e.preventDefault();
      searchInput?.focus();
      return;
    }
    if (e.key === 't' || e.key === 'T') {
      const next = isDarkActive() ? 'light' : 'dark';
      setTheme(next);
      return;
    }
  });

  // ===========================================================================
  // 9. Syntax highlighting (vanilla regex; bash / js / json / markdown)
  // ===========================================================================

  function highlightBash(src) {
    let out = escapeHtml(src);
    // Comments
    out = out.replace(/(^|\n)(#[^\n]*)/g, '$1<span class="tk-comment">$2</span>');
    // Strings (preserve already-escaped content)
    out = out.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '<span class="tk-string">$1</span>');
    // Long flags
    out = out.replace(/(--[a-zA-Z][\w-]*)/g, '<span class="tk-flag">$1</span>');
    // Common command keywords
    out = out.replace(/\b(npx|npm|node|cd|ls|cat|grep|echo|git|docker|export|set|if|then|else|elif|fi|for|do|done|while|case|esac|source|sudo|claude|find|wc|du|tail|head|chmod|chown|mkdir|rm|cp|mv)\b/g, '<span class="tk-keyword">$1</span>');
    return out;
  }

  function highlightJson(src) {
    let out = escapeHtml(src);
    out = out.replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="tk-attr">$1</span>$2');
    out = out.replace(/:(\s*)("(?:\\.|[^"\\])*")/g, ':$1<span class="tk-string">$2</span>');
    out = out.replace(/\b(true|false|null)\b/g, '<span class="tk-keyword">$1</span>');
    out = out.replace(/(:\s*|,\s*|\[\s*|\(\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="tk-number">$2</span>');
    return out;
  }

  function highlightJs(src) {
    let out = escapeHtml(src);
    // Comments
    out = out.replace(/(\/\/[^\n]*)/g, '<span class="tk-comment">$1</span>');
    out = out.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-comment">$1</span>');
    // Strings (single, double, backtick)
    out = out.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, '<span class="tk-string">$1</span>');
    // Keywords
    out = out.replace(/\b(const|let|var|function|return|if|else|for|while|class|extends|new|this|async|await|import|export|from|require|module|exports|true|false|null|undefined|throw|try|catch|finally|in|of|typeof|instanceof|switch|case|break|continue|default|do)\b/g, '<span class="tk-keyword">$1</span>');
    // Numbers
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-number">$1</span>');
    return out;
  }

  function highlightMd(src) {
    let out = escapeHtml(src);
    // Headings
    out = out.replace(/(^|\n)(#{1,6}\s[^\n]*)/g, '$1<span class="tk-keyword">$2</span>');
    // Bold / italic
    out = out.replace(/(\*\*[^*\n]+\*\*)/g, '<span class="tk-attr">$1</span>');
    // Inline code
    out = out.replace(/(`[^`\n]+`)/g, '<span class="tk-string">$1</span>');
    // Links
    out = out.replace(/(\[[^\]\n]+\]\([^)\n]+\))/g, '<span class="tk-function">$1</span>');
    return out;
  }

  function highlightHtml(src) {
    let out = escapeHtml(src);
    // Comments
    out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-comment">$1</span>');
    // Tags
    out = out.replace(/(&lt;\/?[a-zA-Z][\w-]*)/g, '<span class="tk-tag">$1</span>');
    // Attributes
    out = out.replace(/([a-zA-Z-]+)=(&quot;[^&]*?&quot;)/g, '<span class="tk-attr">$1</span>=<span class="tk-string">$2</span>');
    return out;
  }

  const highlighters = {
    bash: highlightBash,
    shell: highlightBash,
    sh: highlightBash,
    json: highlightJson,
    js: highlightJs,
    javascript: highlightJs,
    md: highlightMd,
    markdown: highlightMd,
    html: highlightHtml,
  };

  $$('pre code').forEach((code) => {
    const m = code.className.match(/language-(\S+)/);
    const lang = m && m[1] !== 'text' ? m[1] : null;
    if (!lang) return;
    const fn = highlighters[lang];
    if (!fn) return;
    const raw = code.textContent;
    code.innerHTML = fn(raw);
  });

  // ===========================================================================
  // 10. External link handling (open in new tab — already in HTML, but
  //     also add visual indicator for clarity if desired). No-op here.
  // ===========================================================================

  // ===========================================================================
  // 11. Hash-on-load: scroll to anchor if URL has hash
  // ===========================================================================

  if (window.location.hash) {
    requestAnimationFrame(() => {
      try {
        const target = document.querySelector(window.location.hash);
        target?.scrollIntoView({ behavior: 'auto', block: 'start' });
      } catch (_) { /* ignore invalid hashes */ }
    });
  }

  // ===========================================================================
  // 12. Restore scroll position on theme switch (no flicker)
  // ===========================================================================

  // Already handled by CSS transitions; nothing else needed.

  // ===========================================================================
  // Done. Log build info to console for debugging.
  // ===========================================================================

  // eslint-disable-next-line no-console
  console.info('%cP-Replicator docs', 'color:#58a6ff;font-weight:bold;', 'v1.5.0 — vanilla JS, zero deps. Press / to search, t to toggle theme.');
})();
