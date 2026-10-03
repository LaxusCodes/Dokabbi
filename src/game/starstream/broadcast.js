// Star Stream broadcasts: breaking news, wagers, audience. Pure text builders.
export function breakingNews(lines) {
  return ['📡 STAR STREAM', '', '[Breaking News]', '', ...lines].join('\n');
}

export function globalAnnounce({ scenarioId, title, aLabel, bLabel, participants, minutes, altered }) {
  return [
    '📡 STAR STREAM', '━━━━━━━━━━━━━━━━━━━━', `MAIN SCENARIO #${scenarioId}`, '', `[${title}]`, '',
    `Participants: ${participants} Incarnations`, `Time: ${minutes}:00`, '',
    `A — ${aLabel}`, `B — ${bLabel}`,
    ...(altered ? ['', '⚠️ SPECIAL CONDITION', 'The predetermined future has been altered.', 'Unknown cause.'] : []),
    '━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function globalResult({ title, text, pctA, pctB, aLabel, bLabel }) {
  return ['📡 STAR STREAM', '', `WORLD EVENT — ${title}`, '', text, '', `A "${aLabel}": ${pctA.toFixed(0)}%   B "${bLabel}": ${pctB.toFixed(0)}%`].join('\n');
}

export function audienceLine(viewers, constellations) {
  return `👥 Viewers: ${viewers}   ⭐ Constellations watching: ${constellations}`;
}

export function wagerLine(names = ['a curious constellation'], rng = Math.random) {
  const who = names[Math.floor(rng() * names.length)];
  return `A constellation (${who}) has made a private wager on the outcome.`;
}
