import { getDb } from '../../database/db.js';
import { hostFor } from './dokkaebis.js';
import { clampInterest } from './attention.js';
import { featuredPick } from './global.js';
import constellations from '../../../data/constellations.json' with { type: 'json' };

export function getChannel(guildId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM channel_state WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO channel_state (guild_id, host_id) VALUES (?,?)').run(guildId, hostFor(guildId).id);
    row = db.prepare('SELECT * FROM channel_state WHERE guild_id = ?').get(guildId);
  }
  return row;
}

export function bumpChannel(guildId, { excitement = 0, disturbance = 0, value = null } = {}) {
  const c = getChannel(guildId);
  const next = {
    excitement: Math.max(0, Math.min(99, c.excitement + excitement)),
    disturbance: Math.max(0, Math.min(99, c.disturbance + disturbance)),
    channel_value: value ?? c.channel_value,
  };
  getDb().prepare('UPDATE channel_state SET excitement = ?, disturbance = ?, channel_value = ?, updated_at = datetime(\'now\') WHERE guild_id = ?')
    .run(next.excitement, next.disturbance, next.channel_value, guildId);
  return next;
}

export function recordReaction(guildId, reaction, constellationId, eventKind) {
  getDb().prepare('INSERT INTO audience_reactions (guild_id, reaction, constellation_id, event_kind) VALUES (?,?,?,?)')
    .run(guildId, reaction, constellationId, eventKind);
}

export function topReactions(guildId, limit = 6) {
  return getDb().prepare('SELECT reaction, COUNT(*) n FROM audience_reactions WHERE guild_id = ? GROUP BY reaction ORDER BY n DESC LIMIT ?').all(guildId, limit);
}

export function getInterest(guildId, constellationId) {
  const db = getDb();
  let row = db.prepare('SELECT interest FROM constellation_attention WHERE guild_id = ? AND constellation_id = ?').get(guildId, constellationId);
  if (!row) {
    db.prepare('INSERT INTO constellation_attention (guild_id, constellation_id) VALUES (?,?)').run(guildId, constellationId);
    return 10;
  }
  return row.interest;
}

export function seedAttention(guildId) {
  const db = getDb();
  for (const id of constellationIds()) {
    db.prepare('INSERT OR IGNORE INTO constellation_attention (guild_id, constellation_id) VALUES (?,?)').run(guildId, id);
  }
}

export function addInterest(guildId, constellationId, delta) {
  getInterest(guildId, constellationId); // seeds the row so bumps never vanish
  const next = clampInterest(getInterest(guildId, constellationId) + delta);
  getDb().prepare('UPDATE constellation_attention SET interest = ? WHERE guild_id = ? AND constellation_id = ?').run(next, guildId, constellationId);
  return next;
}

export function topInterests(guildId, limit = 5) {
  return getDb().prepare('SELECT constellation_id, interest FROM constellation_attention WHERE guild_id = ? ORDER BY interest DESC LIMIT ?').all(guildId, limit);
}

export function logIntervention(guildId, constellationId, kind, cost, targetId, summary) {
  getDb().prepare('INSERT INTO constellation_interventions (guild_id, constellation_id, kind, cost, target_id, summary) VALUES (?,?,?,?,?,?)')
    .run(guildId, constellationId, kind, cost, targetId, summary);
}

export function constellationIds() {
  return constellations.map((c) => c.id);
}

// ---- global layer: influence, presence, universe events ----
export function getGlobalInfluence(constellationId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM constellation_global WHERE constellation_id = ?').get(constellationId);
  if (!row) {
    db.prepare('INSERT INTO constellation_global (constellation_id) VALUES (?)').run(constellationId);
    row = db.prepare('SELECT * FROM constellation_global WHERE constellation_id = ?').get(constellationId);
  }
  return row;
}

export function addGlobalInfluence(constellationId, influenceDelta = 0, renownDelta = 0) {
  getGlobalInfluence(constellationId);
  getDb().prepare('UPDATE constellation_global SET influence = MAX(0, influence + ?), renown = renown + ? WHERE constellation_id = ?')
    .run(influenceDelta, renownDelta, constellationId);
  return getGlobalInfluence(constellationId);
}

export function recordGlobalEvent({ kind, summary, originGuild = null, data = {} }) {
  const r = getDb().prepare('INSERT INTO global_events (kind, summary, origin_guild, data) VALUES (?,?,?,?)')
    .run(kind, summary, originGuild, JSON.stringify(data));
  return r.lastInsertRowid;
}

export function recentGlobalEvents(limit = 10) {
  return getDb().prepare('SELECT * FROM global_events ORDER BY id DESC LIMIT ?').all(limit);
}

// Every server a constellation watches, with local interest + chapter.
export function presenceOf(constellationId) {
  const db = getDb();
  const rows = db.prepare('SELECT guild_id, interest FROM constellation_attention WHERE constellation_id = ? ORDER BY interest DESC').all(constellationId);
  return rows.map((r) => {
    const ch = db.prepare(`SELECT chapter_no FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(r.guild_id);
    return { guildId: r.guild_id, interest: r.interest, chapterNo: ch?.chapter_no || 0 };
  });
}

export function topGlobalConstellations(limit = 5) {
  return getDb().prepare('SELECT * FROM constellation_global ORDER BY influence DESC, renown DESC LIMIT ?').all(limit);
}

export function serversAblaze(limit = 10) {
  return getDb().prepare(`SELECT guild_id, COUNT(*) events FROM world_events GROUP BY guild_id ORDER BY events DESC LIMIT ?`).all(limit)
    .map((r) => {
      const ch = getDb().prepare(`SELECT chapter_no FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(r.guild_id);
      return { guildId: r.guild_id, events: r.events, chapterNo: ch?.chapter_no || 0 };
    });
}

// Featured channel inputs: heat per server, computed on demand (no cron, no table).
export function serversHeat(limit = 10) {
  const db = getDb();
  return serversAblaze(limit).map((s) => {
    const channel = db.prepare('SELECT excitement, disturbance FROM channel_state WHERE guild_id = ?').get(s.guildId) || { excitement: 0, disturbance: 0 };
    const alters = db.prepare('SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1').get(s.guildId).v;
    const collisions = db.prepare(`SELECT COUNT(*) v FROM chapter_collisions WHERE guild_id = ? AND status = 'open'`).get(s.guildId).v;
    const headline = db.prepare('SELECT summary FROM world_events WHERE guild_id = ? ORDER BY id DESC LIMIT 1').get(s.guildId)?.summary || null;
    return { ...s, ...channel, alters, collisions, headline, attention: Math.min(99, channel.excitement + channel.disturbance) };
  });
}

export function featuredGuild() {
  return featuredPick(serversHeat(10))?.guildId || null;
}
