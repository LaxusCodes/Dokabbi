import { getDb } from '../../database/db.js';
import seasons from '../../../data/seasons/season_001.json' with { type: 'json' };
import { recordEvent } from '../world/store.js';
import { recordGlobalEvent } from '../starstream/store.js';
import { mintStoryCard } from '../cards/mint.js';

// Seasons are content + scoring. The Director runs the gameplay; this module
// resolves what's active, scores recorded history, and recognizes winners.
export const listSeasons = () => [seasons];

export function activeSeason(now = Date.now()) {
  return listSeasons().find((s) => {
    const start = new Date(s.startsAt).getTime();
    const end = new Date(s.endsAt).getTime();
    return now >= start && now <= end;
  }) || null;
}

export function seasonStatus(season, now = Date.now()) {
  const row = getDb().prepare('SELECT * FROM seasons WHERE id = ?').get(season.id);
  if (row?.status === 'closed') return { state: 'closed', winners: JSON.parse(row.winners || '[]') };
  if (now > new Date(season.endsAt).getTime()) return { state: 'ended' };
  return { state: 'open' };
}

// Server aggregates inside the season window. Pure over injected rows.
export function scoreServers(season, rows) {
  const weights = Object.fromEntries((season.scoring || []).map((s) => [s.metric, s.weight]));
  return rows
    .map((r) => ({
      guildId: r.guildId,
      score: (r.events || 0) * (weights.events || 0)
        + (r.alters || 0) * (weights.alters || 0)
        + (r.clears || 0) * (weights.clears || 0)
        + (r.wagers || 0) * (weights.wagers || 0)
        + (r.chapters || 0) * (weights.chapters || 0),
      detail: r,
    }))
    .sort((a, b) => b.score - a.score);
}

export function gatherServerRows(season) {
  const db = getDb();
  const guilds = db.prepare('SELECT DISTINCT guild_id FROM world_events').all().map((r) => r.guild_id);
  return guilds.map((guildId) => ({
    guildId,
    events: db.prepare('SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND created_at >= ?').get(guildId, season.startsAt).v,
    alters: db.prepare('SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND kind = ? AND created_at >= ?').get(guildId, 'scenario_altered', season.startsAt).v,
    clears: db.prepare('SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND kind = ? AND created_at >= ?').get(guildId, 'scenario_clear', season.startsAt).v,
    wagers: db.prepare('SELECT COUNT(*) v FROM wagers WHERE guild_id = ? AND created_at >= ?').get(guildId, season.startsAt).v,
    chapters: db.prepare('SELECT COUNT(*) v FROM chapter_instances WHERE guild_id = ? AND created_at >= ?').get(guildId, season.startsAt).v,
  }));
}

// Close: recognize winners once, mint the season record, tell the universe.
export function closeSeason(seasonId) {
  const db = getDb();
  const season = listSeasons().find((s) => s.id === seasonId);
  if (!season) throw new Error('No such season.');
  const existing = db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId);
  if (existing?.status === 'closed') return { already: true, winners: JSON.parse(existing.winners || '[]') };
  const board = scoreServers(season, gatherServerRows(season));
  const winners = board.slice(0, 3).map((r, i) => ({ place: i + 1, guildId: r.guildId, score: r.score }));
  // Hidden conditions: rupture witnessed during the season.
  const hidden = [];
  for (const h of season.hidden || []) {
    if (h.metric === 'maxDivergence' && winners.length) {
      hidden.push({ id: h.id, description: h.description, note: 'judged at close' });
    }
  }
  // Every participant of a winning server carries the season.
  const card = season.rewards.card;
  const rewarded = [];
  for (const w of winners) {
    const members = db.prepare('SELECT DISTINCT discord_id FROM chapter_participants WHERE chapter_id IN (SELECT id FROM chapter_instances WHERE guild_id = ?)').all(w.guildId).map((r) => r.discord_id);
    for (const pid of members) {
      mintStoryCard(db, pid, { card_id: `season_${season.id}@${pid}`, name: card.name, scenario_id: 'season', effect: `${card.effect} Placed #${w.place} with Server ${w.guildId}.`, power: card.power });
      const p = db.prepare('SELECT coins FROM players WHERE discord_id = ?').get(pid);
      if (p) db.prepare('UPDATE players SET coins = coins + ? WHERE discord_id = ?').run(Math.floor(season.rewards.coins / Math.max(1, 4 - w.place)), pid);
    }
    rewarded.push({ ...w, members: members.length });
    recordEvent(w.guildId, { kind: 'world_event', actorId: null, summary: `🏆 Season "${season.name}" closed: Server ${w.guildId} placed #${w.place}.` });
  }
  recordGlobalEvent({ kind: 'season', summary: `🏆 Season "${season.name}" closed. Champions: ${winners.map((w) => `${w.guildId} (#${w.place})`).join(', ') || 'none'}.`, originGuild: null });
  db.prepare('INSERT INTO seasons (id, status, winners, closed_at) VALUES (?,?,?,datetime(\'now\')) ON CONFLICT(id) DO UPDATE SET status=?, winners=?, closed_at=datetime(\'now\')')
    .run(seasonId, 'closed', JSON.stringify(winners), 'closed', JSON.stringify(winners));
  return { winners: rewarded, hidden };
}
