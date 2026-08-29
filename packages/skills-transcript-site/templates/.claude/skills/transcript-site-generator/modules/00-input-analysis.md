# Step 0: Input Analysis

## Purpose

Detect the input type, extract raw transcript text, and gather metadata for downstream steps.

## Protocol

### 1. Classify Input

Scan the user's input for:

| Pattern | Input Type | Action |
|---------|-----------|--------|
| `youtube.com/watch?v=` or `youtu.be/` | YouTube URL | Extract via yt-dlp |
| File path ending in `.txt`, `.md`, `.vtt`, `.srt` | Local file | Read file |
| Multi-line text block (>100 chars) | Pasted text | Use directly |
| URL + text block | Combined | URL for embed, text as transcript |

If the input is ambiguous, ask:
```
Detected both a URL and text. Which should I use?
1. URL for video embed + text as transcript content
2. URL only (extract transcript from video)
3. Text only (ignore URL)
```

### 2. YouTube Extraction (if applicable)

```bash
# Check yt-dlp availability
which yt-dlp || pip install yt-dlp

# Extract video metadata
yt-dlp --print title --print channel --print duration --skip-download "<URL>"

# Extract subtitles (prefer manual, fallback to auto-generated)
yt-dlp --write-sub --sub-lang ru,en --skip-download --sub-format vtt -o "/tmp/transcript" "<URL>" 2>/dev/null \
  || yt-dlp --write-auto-sub --sub-lang ru,en --skip-download --sub-format vtt -o "/tmp/transcript" "<URL>"
```

#### VTT Parsing

Parse the `.vtt` file:
1. Skip the `WEBVTT` header and any style blocks
2. Extract timestamp + text pairs
3. Remove duplicate lines (VTT shows overlapping segments)
4. Merge consecutive segments from the same speaker
5. Clean up formatting: remove `<c>` tags, `&amp;` entities, alignment cues

Output format:
```javascript
[
  { timestamp: "00:00:00", text: "First paragraph of merged text..." },
  { timestamp: "00:02:15", text: "Second paragraph..." },
  // ...
]
```

### 3. Language Detection

Analyze the first 500 characters of the transcript to determine the primary UI language:

1. Count Unicode script ranges in the text:
   - Cyrillic: U+0400-U+04FF (Russian, Ukrainian, Bulgarian, Serbian, etc.)
   - Latin: U+0041-U+024F
   - CJK: U+4E00-U+9FFF, U+3040-U+309F, U+30A0-U+30FF
   - Arabic: U+0600-U+06FF
2. Pick the dominant script (highest character count).
3. Map to UI language:
   - Cyrillic-dominant -> `ru` (Russian UI strings)
   - Latin-dominant -> `en` (English UI strings)
   - Other scripts -> `en` (fallback; UI strings in English)

This determines UI strings only (button labels, search placeholder, stats labels).
The transcript content itself is rendered as-is regardless of language.

> **Limitation:** UI strings are currently available in Russian and English only. For other
> Cyrillic-script languages (Ukrainian, Bulgarian), Russian UI strings are used as the closest
> available option. Adding more UI languages requires extending the strings table in Step 2.

### 4. Metadata Collection

Build metadata object:

```javascript
{
  title: "",           // From YouTube title, or ask user
  description: "",     // First 160 chars of transcript (for SEO)
  author: "",          // From YouTube channel, or ask user
  language: "ru|en",
  sourceUrl: "",       // YouTube URL if provided
  videoId: "",         // Extracted from YouTube URL
  duration: "",        // Video duration if YouTube
  publishDate: "",     // Video publish date if YouTube
  wordCount: 0,        // Computed after text extraction
  estimatedReadTime: 0 // wordCount / 200 (avg reading speed)
}
```

### 5. Output

Pass to Step 1:
- `rawText`: Full transcript text (cleaned)
- `timestamps`: Array of `{ timestamp, text }` pairs (or empty if no timestamps)
- `metadata`: Metadata object
- `hasVideo`: Boolean (true if YouTube URL provided)
- `videoId`: YouTube video ID (or null)

## Edge Cases

| Case | Handling |
|------|----------|
| yt-dlp not installed | Prompt user to install or paste text manually |
| No subtitles available | Inform user, ask for manual transcript |
| VTT in unexpected format | Fallback to line-by-line parsing |
| Very short transcript (<500 words) | Warn: site may have minimal content |
| Very long transcript (>50K words) | Proceed normally; long content benefits most from navigation |
| Multiple subtitle languages | Prefer user's detected language, then `ru`, then `en` |

## Checkpoint

```
Step 0/5: Input Analysis Complete
Input type: [text | YouTube | combined]
Language: [ru | en]
Word count: [N] (~[M] min read)
Sections hint: ~[K] sections expected
Video: [yes (videoId) | no]

"ok" to continue | "[feedback]" to adjust
```
