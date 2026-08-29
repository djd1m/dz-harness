# Step 3: Interactivity

## Purpose

Generate `docs/static/app.js` — vanilla JavaScript implementing all interactive features: search, TOC scroll-spy, dark mode, progress bar, copy-quote, and mobile navigation.

## Protocol

### 1. Generate app.js

The JavaScript file follows this structure and implements all features in a single file with no dependencies.

```javascript
// docs/static/app.js

// ═══════════════════════════════════════════════════
// 0. YOUTUBE API SETUP (must register BEFORE DOMContentLoaded)
// ═══════════════════════════════════════════════════
// The YouTube IFrame API calls window.onYouTubeIframeAPIReady as soon as
// the script loads — which may happen BEFORE DOMContentLoaded fires.
// Register the callback immediately at the top level to avoid the race.
let ytPlayer = null;
const ytIframeEl = document.getElementById('yt-player');

if (ytIframeEl) {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player', {
      events: { onReady: () => console.log('YouTube player ready.') }
    });
  };
}

function seekTo(seconds) {
  if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
    ytPlayer.seekTo(seconds, true);
    ytPlayer.playVideo();
    document.getElementById('yt-player').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (ytIframeEl) {
    // Fallback: postMessage if API not loaded yet
    ytIframeEl.contentWindow.postMessage(JSON.stringify({
      event: 'command', func: 'seekTo', args: [seconds, true]
    }), 'https://www.youtube.com');
    ytIframeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Event delegation for timestamp links (data-seek) — no inline onclick needed
document.addEventListener('click', (e) => {
  const seekEl = e.target.closest('[data-seek]');
  if (seekEl) {
    e.preventDefault();
    seekTo(Number(seekEl.dataset.seek));
  }
});

document.addEventListener('DOMContentLoaded', () => {

  // ═══════════════════════════════════════════════════
  // 1. DARK MODE
  // ═══════════════════════════════════════════════════
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const html = document.documentElement;

  // Restore saved theme or detect system preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    html.classList.add('dark');
    themeIcon.classList.replace('fa-moon', 'fa-sun');
  }

  themeToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeIcon.classList.replace(isDark ? 'fa-moon' : 'fa-sun', isDark ? 'fa-sun' : 'fa-moon');
  });

  // ═══════════════════════════════════════════════════
  // 2. MOBILE NAVIGATION
  // ═══════════════════════════════════════════════════
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
  });

  // Close sidebar when clicking a TOC link on mobile
  sidebar.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 1024) {
        sidebar.classList.add('-translate-x-full');
      }
    });
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 1024 &&
        !sidebar.contains(e.target) &&
        !menuToggle.contains(e.target) &&
        !sidebar.classList.contains('-translate-x-full')) {
      sidebar.classList.add('-translate-x-full');
    }
  });

  // ═══════════════════════════════════════════════════
  // 3. TOC SCROLL-SPY
  // ═══════════════════════════════════════════════════
  const tocLinks = document.querySelectorAll('.toc-link');
  const sections = document.querySelectorAll('main section[id]');

  const observerOptions = {
    root: null,
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        tocLinks.forEach(link => {
          link.classList.toggle('bg-primary-50', link.dataset.section === id);
          link.classList.toggle('dark:bg-primary-900/30', link.dataset.section === id);
          link.classList.toggle('text-primary-700', link.dataset.section === id);
          link.classList.toggle('dark:text-primary-300', link.dataset.section === id);
          link.classList.toggle('font-medium', link.dataset.section === id);
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));

  // Smooth scroll for TOC links (use scrollIntoView, not hash anchors)
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.dataset.section;
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ═══════════════════════════════════════════════════
  // 4. READING PROGRESS BAR
  // ═══════════════════════════════════════════════════
  const progressBar = document.getElementById('progress-bar');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        progressBar.style.width = progress + '%';
        ticking = false;
      });
      ticking = true;
    }
  });

  // ═══════════════════════════════════════════════════
  // 5. BACK TO TOP
  // ═══════════════════════════════════════════════════
  const backToTop = document.getElementById('back-to-top');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      backToTop.classList.remove('hidden', 'scale-0');
      backToTop.classList.add('scale-100');
    } else {
      backToTop.classList.remove('scale-100');
      backToTop.classList.add('hidden', 'scale-0');
    }
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ═══════════════════════════════════════════════════
  // 6. SEARCH MODAL
  // ═══════════════════════════════════════════════════
  const searchBtn = document.getElementById('search-btn');
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  function openSearch() {
    searchModal.classList.remove('hidden');
    searchInput.value = '';
    searchResults.innerHTML = '';
    setTimeout(() => searchInput.focus(), 100);
  }

  function closeSearch() {
    searchModal.classList.add('hidden');
  }

  searchBtn.addEventListener('click', openSearch);
  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearch();
  });

  // Debounced search
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(searchInput.value.trim()), 300);
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Split plain text by query matches, escape each segment independently,
  // then wrap matches in <mark>. This prevents highlighting inside HTML
  // entities like &amp; that would be created by escapeHtml.
  // Note: use case-insensitive string comparison instead of regex.test()
  // to avoid the /g flag lastIndex statefulness bug.
  function highlightText(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const lowerQuery = query.toLowerCase();
    return text.split(regex).map(part =>
      part.toLowerCase() === lowerQuery
        ? `<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">${escapeHtml(part)}</mark>`
        : escapeHtml(part)
    ).join('');
  }

  function performSearch(query) {
    if (query.length < 2) {
      searchResults.innerHTML = '';
      return;
    }

    const results = [];
    sections.forEach(section => {
      const title = section.querySelector('h2')?.textContent || '';
      const content = section.querySelector('.prose')?.textContent || '';
      const fullText = title + ' ' + content;
      const lowerQuery = query.toLowerCase();

      if (fullText.toLowerCase().includes(lowerQuery)) {
        // Extract context around match
        const idx = content.toLowerCase().indexOf(lowerQuery);
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + query.length + 60);
        let snippet = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');

        results.push({ id: section.id, title, snippet, query });
      }
    });

    if (results.length === 0) {
      searchResults.innerHTML = `<p class="p-4 text-center text-gray-500">${NO_RESULTS_TEXT}</p>`;
      return;
    }

    searchResults.innerHTML = results.map(r => {
      // Highlight on PLAIN TEXT first, then escape non-match segments.
      // This avoids matching across HTML entity boundaries (e.g. "&amp;").
      const highlighted = highlightText(r.snippet, r.query);
      return `
        <a href="#${r.id}" class="block p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" data-search-result="${r.id}">
          <div class="font-medium text-sm text-gray-900 dark:text-white">${escapeHtml(r.title)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${highlighted}</div>
        </a>
      `;
    }).join('');

    // Click handler for search results
    searchResults.querySelectorAll('[data-search-result]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = el.dataset.searchResult;
        closeSearch();
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Flash highlight
          target.classList.add('bg-primary-50', 'dark:bg-primary-900/20');
          setTimeout(() => target.classList.remove('bg-primary-50', 'dark:bg-primary-900/20'), 2000);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // 7. KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K → open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
    // Escape → close search
    if (e.key === 'Escape') {
      closeSearch();
    }
  });

  // ═══════════════════════════════════════════════════
  // 8. COPY QUOTE
  // ═══════════════════════════════════════════════════
  // Event delegation for copy buttons (data-copy) — no inline onclick needed.
  // Section IDs are read from data attributes, never interpolated into JS strings.
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (!copyBtn) return;
    const sectionId = copyBtn.dataset.copy;
    const section = document.getElementById(sectionId);
    if (!section) return;
    const prose = section.querySelector('.prose');
    if (!prose) return;
    const text = prose.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const icon = copyBtn.querySelector('i');
      if (icon) {
        icon.classList.replace('fa-copy', 'fa-check');
        icon.classList.add('text-green-500');
        setTimeout(() => {
          icon.classList.replace('fa-check', 'fa-copy');
          icon.classList.remove('text-green-500');
        }, 2000);
      }
    }).catch(() => {
      // Fallback for HTTP or unsupported browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  });

  // ═══════════════════════════════════════════════════
  // 9. YOUTUBE — handled above DOMContentLoaded (see Section 0)
  // ═══════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════
  // INIT COMPLETE
  // ═══════════════════════════════════════════════════
  console.log('Transcript site loaded successfully.');
  console.log('Tips: Ctrl+K to search, click timestamps to seek video.');
});
```

### 2. Localization Variable

At the top of the search section, define the "no results" text based on detected language:

```javascript
const NO_RESULTS_TEXT = '{no_results_text}'; // "Ничего не найдено" or "No results found"
```

### 3. Conditional YouTube Code

If no YouTube URL was provided in Step 0:
- Omit the `seekTo` function
- Omit the YouTube embed `<div>` from index.html
- Omit timestamp `<a>` links from section headers

### 4. Performance Notes

- `requestAnimationFrame` prevents excessive progress bar updates during scroll
- `IntersectionObserver` for TOC is more performant than scroll-based position checking
- Search debounce at 300ms prevents UI jank on fast typing
- `backdrop-blur-sm` may be expensive on mobile — keep it on header and search modal only

## Output

Files created:
- `docs/static/app.js` (~10-12 KB)

## Checkpoint

```
Step 3/5: Interactivity Complete
File: docs/static/app.js ({N} KB)
Features: search, TOC scroll-spy, dark mode, progress bar, copy-quote, mobile nav
YouTube sync: {yes | no}
Keyboard shortcuts: Ctrl+K (search), Esc (close)

"ok" to continue | "[feedback]" to adjust
```
