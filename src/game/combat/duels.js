import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { runBattle } from './engine.js';
import { avatarFor } from './constellation.js';
import { buildCombatantFromPlayer } from './fromPlayer.js';
import { constellationName, getWallet } from '../constellations/wallets.js';
import { addFavor } from '../sponsors/contracts.js';
import { shiftRelation, relationState } from '../nebulas/store.js';
import { nebulaOfConstellation } from '../nebulas/politics.js';
import { allNebulaDefs } from '../nebulas/store.js';
import { recordEvent } from '../world/store.js';
import { recordGlobalEvent, addGlobalInfluence } from '../starstream/store.js';
import { applyXp, levelUpGains } from '../progression/levels.js';
import { emit } from '../events/bus.js';

export function openDuel(guildId) {
  return getDb().prepare(`SELECT * FROM duels WHERE guild_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`).get(guildId);
}

export function callDuel(guildId, challengerConst, defenderConst, cause) {
  if (openDuel(guildId)) throw new Error('A duel is already open. Resolve it first.');
  if (challengerConst === defenderConst) throw new Error('A constellation cannot duel itself.');
  const r = getDb().prepare('INSERT INTO duels (guild_id, challenger_const, defender_const, cause) VALUES (?,?,?,?)')
    .run(guildId, challengerConst, defenderConst, cause.slice(0, 160));
  return getDb().prepare('SELECT * FROM duels WHERE id = ?').get(r.lastInsertRowid);
}

export function joinDuel(duelId, discordId, side) {
  if (side !== 'A' && side !== 'B') throw new Error('Side must be A or B.');
  if (!getPlayer(discordId)) throw new Error('Register first with /register.');
  getDb().prepare('INSERT INTO duel_participants (duel_id, discord_id, side) VALUES (?,?,?) ON CONFLICT(duel_id,discord_id) DO UPDATE SET side=?')
    .run(duelId, discordId, side, side);
}

export function duelSides(duelId) {
  return getDb().prepare('SELECT * FROM duel_participants WHERE duel_id = ?').all(duelId);
}

// Champions and empowered incarnations settle it — gods watch, mortals bleed.
export function fightDuel(guildId, duelId) {
  const db = getDb();
  const duel = db.prepare('SELECT * FROM duels WHERE id = ? AND guild_id = ?').get(duelId, guildId);
  if (!duel || duel.status !== 'open') throw new Error('No open duel.');
  emit('combat_started', { guildId, kind: 'duel', duelId });
  const parts = duelSides(duelId);
  const sideOf = (s) => parts.filter((p) => p.side === s).map((p) => getPlayer(p.discord_id)).filter(Boolean);
  const wA = getWallet(guildId, duel.challenger_const);
  const wB = getWallet(guildId, duel.defender_const);
  const teamA = [avatarFor(duel.challenger_const, { influence: wA?.influence || 60, team: 'A' }),
    ...sideOf('A').map((p) => buildCombatantFromPlayer(p, { role: 'Damage', team: 'A' }))];
  const teamB = [avatarFor(duel.defender_const, { influence: wB?.influence || 60, team: 'B' }),
    ...sideOf('B').map((p) => buildCombatantFromPlayer(p, { role: 'Damage', team: 'B' }))];
  const { winner, rounds, log, timeout } = runBattle(teamA, teamB, { scenarioTier: 4 });
  const winnerConst = winner === 'A' ? duel.challenger_const : duel.defender_const;
  const loserConst = winner === 'A' ? duel.defender_const : duel.challenger_const;
  db.prepare(`UPDATE duels SET status = 'resolved', winner = ? WHERE id = ?`).run(winnerConst, duelId);
  // Influence moves; the dispute de-escalates toward peace.
  db.prepare('UPDATE constellation_wallets SET influence = influence + 5 WHERE guild_id = ? AND constellation_id = ?').run(guildId, winnerConst);
  db.prepare('UPDATE constellation_wallets SET influence = MAX(0, influence - 5) WHERE guild_id = ? AND constellation_id = ?').run(guildId, loserConst);
  const nA = nebulaOfConstellation(duel.challenger_const, allNebulaDefs());
  const nB = nebulaOfConstellation(duel.defender_const, allNebulaDefs());
  let cooled = null;
  if (nA && nB && nA !== nB && ['Competitive', 'Hostile', 'At War'].includes(relationState(guildId, nA, nB))) {
    cooled = shiftRelation(guildId, nA, nB, -1);
  }
  // Participants are paid and remembered.
  const results = [];
  for (const part of parts) {
    const won = (part.side === 'A') === (winner === 'A');
    const p = getPlayer(part.discord_id);
    const { level, xp, leveled } = applyXp({ level: p.level, xp: p.xp }, won ? 80 : 20);
    const patch = { xp, level, coins: p.coins + (won ? 300 : 50) };
    if (leveled.length) {
      const g = levelUpGains();
      patch.max_hp = p.max_hp + g.max_hp * leveled.length;
      patch.hp = patch.max_hp;
    }
    updatePlayer(part.discord_id, patch);
    if (won) addFavor(part.discord_id, winnerConst, 10);
    results.push(`${p.name}: ${won ? '+300 coins, +80 XP, favor +10' : '+50 coins, +20 XP'}`);
  }
  recordEvent(guildId, {
    kind: 'world_event', actorId: null,
    summary: `⚔️ CONSTELLATION DUEL — ${constellationName(winnerConst)} prevails over ${constellationName(loserConst)} (${rounds} rounds). Cause: ${duel.cause}.${cooled ? ` Factions cool to ${cooled}.` : ''}`,
  });
  // The universe notices: global influence moves, every server hears it.
  addGlobalInfluence(winnerConst, 3, 1);
  addGlobalInfluence(loserConst, -2, 0);
  recordGlobalEvent({ kind: 'duel', summary: `⚔️ ${constellationName(winnerConst)} defeated ${constellationName(loserConst)} before ${parts.length} champion(s).`, originGuild: guildId });
  emit('constellation_intervened', { guildId, winner: winnerConst, loser: loserConst });
  emit('combat_finished', { guildId, kind: 'duel', winner });
  return { winnerConst, loserConst, rounds, log, timeout, results, cooled };
}
