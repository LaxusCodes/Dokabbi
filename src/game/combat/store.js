import { getDb } from '../../database/db.js';
import { START_ELO } from './pvp.js';

export function saveCombatLog({ kind, participants, winnerId, log, rewards }) {
  const db = getDb();
  const r = db
    .prepare('INSERT INTO combat_logs (kind, participants, winner_id, log, rewards) VALUES (?,?,?,?,?)')
    .run(kind, JSON.stringify(participants), winnerId, JSON.stringify(log.slice(0, 200)), JSON.stringify(rewards || {}));
  return r.lastInsertRowid;
}

export function recentLogs(discordId, limit = 5) {
  return getDb()
    .prepare(`SELECT * FROM combat_logs WHERE participants LIKE '%' || ? || '%' ORDER BY id DESC LIMIT ?`)
    .all(discordId, limit);
}

export function getRating(discordId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM pvp_ratings WHERE discord_id = ?').get(discordId);
  if (!row) {
    db.prepare('INSERT INTO pvp_ratings (discord_id, elo) VALUES (?,?)').run(discordId, START_ELO);
    row = db.prepare('SELECT * FROM pvp_ratings WHERE discord_id = ?').get(discordId);
  }
  return row;
}

export function recordPvpResult({ winnerId, loserId, winnerElo, loserElo }) {
  const db = getDb();
  const now = Date.now();
  for (const [id, elo, won] of [[winnerId, winnerElo, 1], [loserId, loserElo, 0]]) {
    getRating(id);
    db.prepare(
      `UPDATE pvp_ratings SET elo = ?, wins = wins + ?, losses = losses + ?, last_fight_at = ?, fights_today = fights_today + ?, today_key = ? WHERE discord_id = ?`
    ).run(elo, won ? 1 : 0, won ? 0 : 1, now, 1, dayKey(now), id);
  }
  // Reset other-day counters lazily on read (see fightsToday).
}

export function fightsToday(discordId, now = Date.now()) {
  const r = getRating(discordId);
  if (r.today_key !== dayKey(now)) {
    getDb().prepare('UPDATE pvp_ratings SET fights_today = 0, today_key = ? WHERE discord_id = ?').run(dayKey(now), discordId);
    return 0;
  }
  return r.fights_today;
}

export function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// Pending-duel store for /pvp challenge -> /pvp accept flow.
export function createChallenge(challengerId, opponentId, focus = 'front') {
  const db = getDb();
  db.prepare(`UPDATE pvp_challenges SET status = 'expired' WHERE status = 'pending' AND (challenger_id = ? OR opponent_id = ?)`)
    .run(challengerId, challengerId);
  const r = db
    .prepare('INSERT INTO pvp_challenges (challenger_id, opponent_id, focus, status) VALUES (?,?,?,?)')
    .run(challengerId, opponentId, focus, 'pending');
  return r.lastInsertRowid;
}

export function pendingFor(opponentId) {
  return getDb()
    .prepare(`SELECT * FROM pvp_challenges WHERE opponent_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`)
    .get(opponentId);
}

export function resolveChallenge(id, status) {
  getDb().prepare('UPDATE pvp_challenges SET status = ? WHERE id = ?').run(status, id);
}

// ---- stigma mastery ----
export function getMastery(discordId, stigmaId) {
  const row = getDb().prepare('SELECT * FROM stigma_mastery WHERE discord_id = ? AND stigma_id = ?').get(discordId, stigmaId);
  return row || { discord_id: discordId, stigma_id: stigmaId, uses: 0, protects: 0 };
}

export function addMastery(discordId, stigmaId, { uses = 0, protects = 0 } = {}) {
  const db = getDb();
  db.prepare('INSERT INTO stigma_mastery (discord_id, stigma_id, uses, protects) VALUES (?,?,?,?) ON CONFLICT(discord_id,stigma_id) DO UPDATE SET uses=uses+?, protects=protects+?')
    .run(discordId, stigmaId, uses, protects, uses, protects);
  return getMastery(discordId, stigmaId);
}

export function playerStigmas(discordId) {
  return getDb().prepare('SELECT * FROM player_stigmas WHERE discord_id = ?').all(discordId);
}

// ---- battle bonds: pairs that save each other ----
export function honoredPairsFor(guildId, memberIds) {
  if (memberIds.length < 2) return [];
  const rows = getDb().prepare('SELECT a, b FROM bond_counters WHERE guild_id = ? AND honored = 1').all(guildId);
  const ids = new Set(memberIds);
  return rows.filter((r) => ids.has(r.a) && ids.has(r.b)).map((r) => [r.a, r.b]);
}

// Returns newly-honored pairs (threshold crossed by this battle).
export function recordSaves(guildId, pairs, threshold = 3) {
  const db = getDb();
  const newly = [];
  for (const [x, y] of pairs) {
    const [a, b] = [x, y].sort();
    db.prepare('INSERT INTO bond_counters (a, b, guild_id, saves) VALUES (?,?,?,1) ON CONFLICT(a,b,guild_id) DO UPDATE SET saves=saves+1').run(a, b, guildId);
    const row = db.prepare('SELECT saves, honored FROM bond_counters WHERE a = ? AND b = ? AND guild_id = ?').get(a, b, guildId);
    if (row.saves >= threshold && !row.honored) {
      db.prepare('UPDATE bond_counters SET honored = 1 WHERE a = ? AND b = ? AND guild_id = ?').run(a, b, guildId);
      newly.push([a, b]);
    }
  }
  return newly;
}
