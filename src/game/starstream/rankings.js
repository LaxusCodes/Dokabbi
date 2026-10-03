// Rankings from events and attention — never raw level. Pure.
export function mostWatched(events, nameOf, limit = 3) {
  const counts = new Map();
  for (const e of events) {
    if (!e.actor_id) continue;
    counts.set(e.actor_id, (counts.get(e.actor_id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([id, views], i) => ({ rank: i + 1, name: nameOf(id), views }));
}

export function mostDangerousParties(combatLogs, nameOf, limit = 3) {
  // Wins per participant; parties aggregate their members.
  const wins = new Map();
  for (const log of combatLogs) {
    if (log.winner_id) wins.set(log.winner_id, (wins.get(log.winner_id) || 0) + 1);
  }
  return [...wins.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([id, w], i) => ({ rank: i + 1, name: nameOf(id), wins: w }));
}

export function mostActiveConstellations(interests, nameOf, limit = 3) {
  return interests.slice(0, limit).map((r, i) => ({ rank: i + 1, name: nameOf(r.constellation_id), interest: r.interest }));
}

export function rankingsText({ watched, parties, constellations }) {
  return [
    '🏆 STAR STREAM RANKINGS', '',
    '🔥 MOST WATCHED INCARNATIONS',
    ...(watched.length ? watched.map((w) => `#${w.rank} ${w.name} — ${w.views} views`) : ['_No one is watching yet._']),
    '',
    '⚔️ MOST DANGEROUS',
    ...(parties.length ? parties.map((w) => `#${w.rank} ${w.name} — ${w.wins} wins`) : ['_No blood yet._']),
    '',
    '⭐ MOST ACTIVE CONSTELLATIONS',
    ...(constellations.length ? constellations.map((w) => `#${w.rank} ${w.name} — interest ${w.interest}`) : ['_The stars are quiet._']),
  ].join('\n');
}
