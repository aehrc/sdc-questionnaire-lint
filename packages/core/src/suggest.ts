function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

// The closest candidate within a small edit distance, for "a … with a similar name exists" help.
// Ties go to the candidate that sorts first by code unit.
export function closestName(name: string, candidates: Iterable<string>): string | undefined {
  const limit = Math.max(1, Math.floor(name.length / 5));
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance === 0 || distance > limit) continue;
    if (
      best === undefined ||
      distance < best.distance ||
      (distance === best.distance && candidate < best.candidate)
    ) {
      best = { candidate, distance };
    }
  }
  return best?.candidate;
}
