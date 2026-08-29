# Step 1: Content Parsing

## Purpose

Split raw transcript text into logical sections with titles, timestamps, and word counts.

## Protocol

### 1. Section Detection Strategy

Try these strategies in order until one yields 3+ sections:

#### Strategy A: Explicit Markers
Look for existing structure in the text:
- Markdown headings (`## Title`, `### Title`)
- Numbered headers (`1. Topic`, `2. Topic`)
- Bold markers (`**Topic:**`)
- Speaker labels (`Speaker Name:`, `Host:`, `Guest:`)
- Explicit section breaks (`---`, `===`, blank lines > 3)

#### Strategy B: Topic Shift Detection
If no explicit markers found:
- Analyze paragraphs for semantic topic shifts
- Group related paragraphs into sections
- Target 5-15 sections for optimal navigation
- Each section should be 200-2000 words

#### Strategy C: Time-Based Splitting (for YouTube with timestamps)
If timestamps are available:
- Group content into ~5-minute segments
- Adjust boundaries to natural pause points
- Use topic keywords from each segment for titles

### 2. Title Generation

For each section, generate a concise title (3-8 words):
- Extract the main topic or key phrase
- Use sentence case
- Avoid generic titles ("Part 1", "Continued")
- If speakers are identified, optionally include: "Speaker Name: Topic"

### 3. Timestamp Association

For each section:
- Assign the timestamp of its first paragraph
- Format: `HH:MM:SS` or `MM:SS` (depending on duration)
- If no timestamps available, set to `null`

### 4. Section Schema

```javascript
{
  id: "section-slug",       // kebab-case from title
  order: 1,                 // 1-based sequential
  title: "Section Title",
  shortTitle: "Short",      // 2-3 words for mobile TOC
  timestamp: "00:05:30",    // or null
  timestampSeconds: 330,    // for YouTube seek, or null
  content: "Full text...",  // Markdown-safe text
  wordCount: 450,
  speakerName: "Boris",     // or null if not identified
  speakerRole: "Guest"      // "Host" | "Guest" | null
}
```

### 5. Speaker Detection

If the transcript has multiple speakers:
- Detect speaker labels (Name:, [Name], SPEAKER_NAME:)
- Assign speaker metadata to each section
- Generate speaker list for metadata:
  ```javascript
  speakers: [
    { name: "Boris Cherny", role: "Guest" },
    { name: "Gergely Orosz", role: "Host" }
  ]
  ```

### 6. Content Cleaning

For each section's content:
- Normalize whitespace (collapse multiple spaces/newlines)
- Fix broken sentences from VTT merging
- Preserve paragraph breaks (double newline)
- Escape HTML special characters (`<`, `>`, `&`, `"`)
- Convert `**bold**` to retain emphasis
- Remove timecode artifacts if they appear inline

## Output

Pass to Step 2:
- `sections`: Array of section objects (schema above)
- `speakers`: Array of speaker objects (or empty)
- `totalWordCount`: Sum of all section word counts
- `estimatedReadTime`: totalWordCount / 200, rounded up

## Edge Cases

| Case | Handling |
|------|----------|
| Only 1-2 sections detected | Warn user, suggest splitting by time or paragraphs |
| Section > 3000 words | Auto-split at paragraph boundaries |
| No clear topic shifts | Split every ~500 words with generated titles |
| Mixed languages in transcript | Keep as-is, note in metadata |
| Code blocks in transcript | Preserve with ``` markers |

## Checkpoint

```
Step 1/5: Content Parsing Complete
Sections: [N] sections created
Speakers: [names or "single speaker"]
Timestamps: [available | not available]
Avg section length: [N] words

"ok" to continue | "[feedback]" to adjust
```
