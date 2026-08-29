# Example: Text-Only Transcript Site (No YouTube)

## Input

```
Input type: Pasted text
Title: "AI in Healthcare: Panel Discussion at TechConf 2025"
Language: English
YouTube: none
```

## Parsed Sections (Step 1 Output)

```
Section 1: "Opening Remarks" - 480 words
Section 2: "Current State of Medical AI" - 1120 words
Section 3: "Regulatory Challenges" - 890 words
Section 4: "Patient Data Privacy" - 1050 words
Section 5: "Clinical Decision Support Systems" - 1340 words
Section 6: "AI-Assisted Diagnostics in Radiology" - 960 words
Section 7: "Audience Q&A" - 720 words
Section 8: "Closing Thoughts" - 410 words

Total: 6,970 words, ~35 min read, 3 speakers
```

## Generated File Structure

```
project-root/
├── docs/
│   ├── index.html       (52 KB)
│   └── static/
│       ├── app.js        (9 KB)   <- smaller: no YouTube seek code
│       └── style.css     (0.4 KB)
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

## Key Differences from YouTube Example

| Aspect | YouTube Example | Text-Only Example |
|--------|----------------|-------------------|
| Video embed | Yes (`<iframe>`) | Omitted |
| Timestamp links | Yes (`seekTo()`) | Omitted |
| `seekTo` function | In app.js | Not generated |
| `onYouTubeIframeAPIReady` | In app.js | Not generated |
| `og:type` | `video.other` | `article` |
| JSON-LD VideoObject | Yes | Omitted |
| `og:image` | YouTube thumbnail | Not set (or custom) |
| app.js size | ~11 KB | ~9 KB |

## Sample Section HTML (No Timestamp)

```html
<section id="section-regulatory-challenges" class="mb-12 scroll-mt-20">
  <div class="flex items-start justify-between mb-4">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
      3. Regulatory Challenges
    </h2>
    <button data-copy="section-regulatory-challenges"
            class="copy-btn flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800
                   text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 no-print"
            aria-label="Copy">
      <i class="far fa-copy"></i>
    </button>
  </div>
  <div class="mb-3 flex items-center gap-2">
    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                 bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200">
      Dr. Sarah Chen &middot; Panelist
    </span>
  </div>
  <div class="prose prose-lg dark:prose-invert max-w-none">
    <p>The FDA's approach to AI-based medical devices has evolved significantly...</p>
    <p>We're seeing a shift from traditional 510(k) pathways to the new PCCP framework...</p>
  </div>
</section>
```

## SEO Head (Article-only, no VideoObject)

```html
<title>AI in Healthcare: Panel Discussion at TechConf 2025</title>
<meta name="description" content="Panel discussion transcript covering medical AI, regulatory challenges, patient data privacy, and clinical decision support systems." />
<meta property="og:type" content="article" />
<!-- No og:image (no YouTube thumbnail available) -->
```

## JSON-LD (Article only)

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "AI in Healthcare: Panel Discussion at TechConf 2025",
  "author": { "@type": "Organization", "name": "TechConf" },
  "datePublished": "2025-11-15",
  "description": "Panel discussion transcript covering medical AI...",
  "wordCount": 6970
}
```

## Stats Displayed in Header

```
35 min read · 6,970 words · 8 sections
```

## Verification Results

```
File checks: 5/5 passed
HTML structure: 11/11 passed  (no YouTube-specific checks)
Content: 6/6 passed
Interactivity: 8/8 passed    (no seekTo/YouTube checks)
Responsive: 6/6 passed
Dark mode: 6/6 passed
SEO: 5/5 passed              (no VideoObject checks)
Print: 4/4 passed
```
