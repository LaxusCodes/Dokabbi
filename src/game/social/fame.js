import { getDb } from '../../database/db.js';
import { gatherStats } from '../titles/queries.js';
import { computeDivergence } from '../canon/divergence.js';

// Many kinds of fame — no single power leaderboard. All inputs already recorded.
export function fameOf(discordId, guildId) {
  const s = gatherStats(discordId, guildId);
  let divergence = 0;
  try { divergence = computeDivergence(guildId).score; } catch { /* per-server, not per-player */ }
  const personalAlters = s.alters;
  return {
    watched: s.world_events,
    chronicle: s.world_events,
    dangerous: s.wins,
    anomaly: personalAlters * 8 + (s.ledger_cuts + s.forewarns) * 2,
    market: 0, // trade volume lives in counters; see fameWithTrade
    favorite: s.favor_max,
    influence: s.world_events + s.wins * 2 + Math.floor(divergence / 10) + Math.floor(personalAlters / 2),
  };
}

export function fameWithTrade(discordId, guildId) {
  const base = fameOf(discordId, guildId);
  const vol = getDb().prepare('SELECT value FROM title_counters WHERE discord_id = ? AND key = ?').get(discordId, 'trade_volume')?.value || 0;
  return { ...base, market: vol };
}

// Generic top-N over candidate ids. Pure given rows.
export function rankBy(ids, scoreOf, limit = 3) {
  return ids
    .map((id) => ({ id, score: scoreOf(id) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function fameBoard(guildId, limit = 3) {
  const db = getDb();
  const ids = db.prepare('SELECT discord_id FROM players').all().map((r) => r.discord_id);
  const nameOf = (id) => db.prepare('SELECT name FROM players WHERE discord_id = ?').get(id)?.name || id;
  const board = (label, emoji, fn) => ({
    label, emoji,
    rows: rankBy(ids, (id) => fn(id), limit).map((r, i) => `#${i + 1} ${nameOf(r.id)} — ${r.score}`),
  });
  return [
    board('Most Watched', '👑', (id) => fameWithTrade(id, guildId).watched),
    board('Greatest Chronicle', '📖', (id) => fameWithTrade(id, guildId).chronicle),
    board('Most Dangerous', '⚔️', (id) => fameWithTrade(id, guildId).dangerous),
    board('Greatest Anomaly', '🌌', (id) => fameWithTrade(id, guildId).anomaly),
    board('Market Maker', '💰', (id) => fameWithTrade(id, guildId).market),
    board('Constellation Favorite', '⭐', (id) => fameWithTrade(id, guildId).favorite),
  ];
}

export function fameText(board) {
  return ['🏆 **FAME OF THE STREAM** — many kinds of famous', '',
    ...board.flatMap((b) => [`${b.emoji} **${b.label}**`, ...(b.rows.length ? b.rows : ['_No one yet._']), '']),
  ].join('\n');
}

export function compareText(aName, bName, a, b) {
  const rows = [
    ['Level', a.level, b.level],
    ['Stories', a.stories, b.stories],
    ['Scenario clears', a.clears, b.clears],
    ['Combat wins', a.wins, b.wins],
    ['Trades (volume)', a.trade_volume, b.trade_volume],
    ['Max favor', a.favor_max, b.favor_max],
    ['World events', a.world_events, b.world_events],
    ['Titles earned', a.titles, b.titles],
  ];
  const mark = (x, y) => (x === y ? '=' : x > y ? '▲' : '▽');
  return [`⚖️ **${aName} vs ${bName}**`, '',
    ...rows.map(([label, x, y]) => `${mark(x, y)} ${label}: **${x}** — **${y}**`),
  ].join('\n');
}
