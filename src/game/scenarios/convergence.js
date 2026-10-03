// Convergence verdicts: CONVERGE, PERSIST, or COLLIDE — decided from world weight. Pure.
export function branchVerdict(branch, { participantCount = 0, hasCollision = false, dokjaAttention = 0, importance = 0 } = {}) {
  if (hasCollision) return { verdict: 'COLLIDE', reason: 'opposing objectives demand resolution' };
  if (participantCount <= 1 && importance < 2) return { verdict: 'CONVERGE', reason: 'too small a ripple to sustain' };
  if ((branch.path && importance >= 2) || dokjaAttention >= 30) return { verdict: 'PERSIST', reason: 'the stream is too invested to let go' };
  return { verdict: 'CONVERGE', reason: 'threads rejoin the main story' };
}

// Chapter-level importance from accumulated world state.
export function chapterImportance(snapshot = {}) {
  return (snapshot.alters || 0) + Math.floor((snapshot.sponsors || 0) / 2) + (snapshot.bonds || 0);
}

export function convergenceSummary(chapterNo, branches, verdicts) {
  const lines = [`Chapter ${chapterNo} convergence:`];
  for (const b of branches) {
    const v = verdicts[b.branch_key] || { verdict: 'CONVERGE', reason: '' };
    lines.push(`• ${b.branch_key} [${b.path || 'undecided'}] → ${v.verdict} — ${v.reason}`);
  }
  return lines.join('\n');
}
