// Global Star Stream: one universe above all servers. Pure builders.
// Server tables stay local; only influence, presence, and major events go global.
export function presenceView({ constellationName, influence, renown, servers }) {
  const lines = [`⭐ ${constellationName}`, '', 'Watching:', '━━━━━━━━━━━━━━━━', ''];
  for (const s of servers) {
    lines.push(`${s.guildId}\n  Chapter ${String(s.chapterNo).padStart(3, '0')}\n  Interest: ${s.interest}${s.interest >= 90 ? ' 🔥' : ''}`);
    lines.push('');
  }
  lines.push(`Global influence: ${influence}   Renown: ${renown}`);
  return lines.join('\n');
}

export function breakingEventText({ originGuild, summary, attentionGain }) {
  return [
    '📡 STAR STREAM BREAKING EVENT', '',
    `${summary}`,
    `Origin: Server ${originGuild}`,
    '',
    `Global attention +${attentionGain}%`,
    '',
    'Several constellations have redirected their attention.',
  ].join('\n');
}

export function universeOverview({ servers, constellations, events, nebulas = [] }) {
  return [
    '🌌 GLOBAL STAR STREAM', '',
    `Servers alight: ${servers.length}`,
    ...servers.slice(0, 5).map((s) => `• ${s.guildId} — Chapter ${String(s.chapterNo).padStart(3, '0')} (${s.events} events)`),
    '',
    '⭐ Constellations (global influence / renown):',
    ...constellations.slice(0, 5).map((c) => `• ${c.name} — ${c.influence} / ${c.renown}`),
    ...nebulaLines(nebulas),
    '',
    '📡 Recent universe events:',
    ...(events.length ? events.slice(0, 4).map((e) => `• ${e.summary}`) : ['_The universe is quiet._']),
  ].join('\n');
}

function nebulaLines(nebulas) {
  if (!nebulas.length) return [];
  return ['', '🌌 Nebulas (one faction, many servers):',
    ...nebulas.map((n) => `• ${n.name} — watched on ${n.servers.length} server(s)${n.servers.length ? ` (${n.servers.slice(0, 3).map((s) => `${s.guild}:${s.members}`).join(', ')})` : ''}`)];
}

// Tonight's Featured Channel: hosts discover servers by heat, not seniority.
export function featuredPick(servers) {
  if (!servers.length) return null;
  const score = (s) => (s.excitement || 0) + (s.disturbance || 0) * 2 + (s.alters || 0) * 5 + (s.collisions || 0) * 4;
  return servers.reduce((a, b) => (score(b) > score(a) ? b : a));
}

export function trendingText({ servers, events, featured }) {
  const lines = ['🌌 GLOBAL STAR STREAM', '', '🔥 TRENDING ACROSS THE STREAM', ''];
  for (const s of servers.slice(0, 5)) {
    lines.push(`${s.guildId}\n  "${s.headline || 'A quiet server'}"\n  Attention: ${s.attention}`);
    lines.push('');
  }
  if (featured) lines.push(`🎙️ Tonight's Featured Channel: **${featured.guildId}** — the hosts are watching. (+5% chapter rewards there.)`);
  if (events.length) {
    lines.push('', ...events.slice(0, 3).map((e) => `• ${e.summary}`));
  }
  return lines.join('\n');
}
