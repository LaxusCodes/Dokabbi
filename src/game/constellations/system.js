// Constellation favor / broadcast reactions. Original characters only.
export function reactToOutcome(outcome, rng = Math.random) {
  const lines = [];
  if (outcome === 'success') {
    lines.push('A warrior constellation nods in approval');
    if (rng() < 0.3) lines.push('A trickster constellation laughs with delight');
  } else {
    lines.push('Some constellations sigh in disappointment');
    if (rng() < 0.25) lines.push('A judge-like constellation urges you to rise again');
  }
  return lines;
}
export function favorDelta(success) {
  return success ? { favor: 5, interest: 3 } : { favor: -2, interest: 1 };
}
