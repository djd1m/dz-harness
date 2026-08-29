# Data Schemas Reference

## Section Schema

Each transcript section is represented internally during generation:

```typescript
interface Section {
  id: string;              // kebab-case slug, e.g. "early-career"
  order: number;           // 1-based sequential
  title: string;           // Display title, e.g. "2. Early Career"
  shortTitle: string;      // 2-3 words for mobile TOC
  timestamp: string | null;     // "HH:MM:SS" or "MM:SS" or null
  timestampSeconds: number | null; // For YouTube seek, or null
  content: string;         // Full text, paragraphs separated by \n\n
  wordCount: number;       // Words in content
  speakerName: string | null;   // e.g. "Boris Cherny"
  speakerRole: string | null;   // "Host" | "Guest" | null
}
```

### Section ID Rules

- Derived from title, lowercase, kebab-case
- Remove numbers and punctuation
- Max 40 characters
- Must be unique across all sections
- Prefixed with `section-` in HTML (e.g., `id="section-early-career"`)

### Content Formatting

In the HTML rendering, content follows these rules:
- Paragraphs → `<p>` tags inside a `.prose` container
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- Inline code → `<code class="...">`
- URLs → `<a href="..." target="_blank" class="text-primary-500 hover:underline">`
- Line breaks within a paragraph → `<br />`
- Special characters escaped: `<`, `>`, `&`, `"`

## Metadata Schema

```typescript
interface Metadata {
  title: string;            // Page title
  description: string;      // Max 160 chars for SEO
  author: string;
  language: "ru" | "en";
  date: string;             // ISO 8601 date

  video: {
    url: string;            // Full YouTube URL
    videoId: string;        // 11-char YouTube ID
    embedUrl: string;       // https://www.youtube.com/embed/{videoId}
    duration: string;       // ISO 8601 duration (PT1H23M)
    channelName: string;
    publishDate: string;
  } | null;

  stats: {
    totalWords: number;
    estimatedReadMinutes: number; // totalWords / 200, rounded up
    sectionCount: number;
    speakerCount: number;
  };

  speakers: Array<{
    name: string;
    role: "Host" | "Guest" | "Speaker";
  }>;

  seo: {
    ogTitle: string;
    ogDescription: string;
    ogType: "article" | "video.other";
    ogImage: string | null;        // YouTube thumbnail or null
    twitterCard: "summary_large_image";
    jsonLdType: "Article" | "VideoObject";
  };
}
```

## VTT Subtitle Schema (Input)

When parsing YouTube VTT files:

```
WEBVTT

00:00:00.000 --> 00:00:05.500
First line of subtitle text

00:00:03.000 --> 00:00:08.000
Second line (may overlap with first)

00:00:08.000 --> 00:00:12.500
Third line
```

### VTT Parsing Rules

1. Skip `WEBVTT` header line and any `NOTE` or `STYLE` blocks
2. Parse timestamp lines: `HH:MM:SS.mmm --> HH:MM:SS.mmm`
3. Extract text lines between timestamp blocks
4. Remove HTML tags (`<c>`, `</c>`, `<c.colorE5E5E5>`, etc.)
5. Deduplicate: if two consecutive segments have >80% text overlap, keep only the later one
6. Merge segments into paragraphs: group consecutive segments by speaker or 30-second gaps
7. Round timestamps to nearest second for display

## GitHub Pages Deploy Schema

```yaml
# .github/workflows/deploy.yml structure
name: Deploy to GitHub Pages
on: push (main) + workflow_dispatch
permissions: contents:read, pages:write, id-token:write
jobs.deploy:
  steps:
    - checkout
    - configure-pages
    - upload-pages-artifact (path: 'docs')
    - deploy-pages
```
