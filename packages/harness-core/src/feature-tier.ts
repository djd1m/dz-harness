import type { FeatureTier } from './guard-volume.js';

function tiersAfterMarkers(line: string): FeatureTier[] {
  if (!/^\s*(?:##\s*)?(?:\*\*)?(?:Tier|Тир)(?=$|[\s:*])/iu.test(line)) return [];
  const tiers: FeatureTier[] = [];
  for (const marker of line.matchAll(/Tier|Тир/giu)) {
    const markerIndex = marker.index ?? 0;
    const previous = line[markerIndex - 1];
    if (previous !== undefined && /[\p{L}\p{N}_]/u.test(previous)) continue;
    const tail = line.slice(markerIndex + marker[0].length);
    // A template line lists several tiers after one marker («Tier: S / M / L / XL», «Tier: S|M») — every
    // listed token is a candidate, so the caller sees the ambiguity instead of the first token (QE 08c #1).
    const match = tail.match(/^(?:\s*:\s*|\s+)(?:\*\*)?\s*(XL|[SML])((?:\s*[/|,]\s*(?:XL|[SML]))*)(?=$|[\s.*)—–-])/iu);
    if (match?.[1] !== undefined) {
      tiers.push(match[1].toUpperCase() as FeatureTier);
      for (const extra of (match[2] ?? '').matchAll(/XL|[SML]/giu)) tiers.push(extra[0].toUpperCase() as FeatureTier);
    }
  }
  return tiers;
}

function tierAtContinuationStart(line: string): FeatureTier | null {
  const match = line.match(/^\s*(?:\*\*)?\s*(XL|[SML])(?=$|[\s:.*)—–-])/iu);
  return match?.[1] === undefined ? null : match[1].toUpperCase() as FeatureTier;
}

export function parseFeatureTier(text: string): FeatureTier | null {
  const lines = text.split(/\r?\n/);
  const candidates = new Set<FeatureTier>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    for (const inline of tiersAfterMarkers(line)) candidates.add(inline);

    if (!/^\s*##\s*(?:Tier|Тир)\s*$/iu.test(line)) continue;
    const continuation = lines.slice(index + 1).find((next) => next.trim() !== '');
    if (continuation === undefined) continue;
    const continuedTiers = tiersAfterMarkers(continuation);
    if (continuedTiers.length > 0) {
      for (const nextTier of continuedTiers) candidates.add(nextTier);
    } else {
      const nextTier = tierAtContinuationStart(continuation);
      if (nextTier !== null) candidates.add(nextTier);
    }
  }

  return candidates.size === 1 ? [...candidates][0]! : null;
}

export function readFeatureTier(
  read: (rel: string) => string | null,
  slug: string,
): FeatureTier | null {
  const text = read(`features/${slug}/00_complexity_assessment.md`);
  return text === null ? null : parseFeatureTier(text);
}
