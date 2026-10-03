import { randomUUID } from 'node:crypto';
import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import nebulas from '../../../data/nebulas.json' with { type: 'json' };
import agendas from '../../../data/nebula_agendas.json' with { type: 'json' };
import { rankFor, shiftState, AID_COST, AID_COOLDOWN_MS, MIN_AID_RANK, meetsRank } from './system.js';
import { bumpCounter } from '../titles/counters.js';
import { storyFromAchievement } from '../stories/system.js';
import { mintStoryCard } from '../cards/mint.js';

export const nebulaDef = (id) => nebulas.find((n) => n.id === id);
export const allNebulaDefs = () => nebulas;

function ensureRow(nebulaId, name, leaderId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM nebulas WHERE id = ?').get(nebulaId);
  if (!row) {
    db.prepare('INSERT INTO nebulas (id, name, leader_id) VALUES (?,?,?)').run(nebulaId, name, leaderId);
    row = db.prepare('SELECT * FROM nebulas WHERE id = ?').get(nebulaId);
  }
  return row;
}

export function getNebula(nebulaId) {
  const def = nebulaDef(nebulaId);
  const row = ensureRow(nebulaId, def?.name || nebulaId, null);
  const members = getDb().prepare('SELECT * FROM nebula_members WHERE nebula_id = ?').all(nebulaId);
  return { ...row, def, members };
}

export function memberOf(discordId, guildId = null) {
  const db = getDb();
  let m = null;
  if (guildId) m = db.prepare('SELECT * FROM nebula_members WHERE discord_id = ? AND guild_id = ?').get(discordId, guildId);
  // Legacy rows (no guild) are grandfathered: one person, one universe-wide oath, until they re-swear.
  if (!m) m = db.prepare('SELECT * FROM nebula_members WHERE discord_id = ? AND guild_id IS NULL').get(discordId);
  if (!m && !guildId) m = db.prepare('SELECT * FROM nebula_members WHERE discord_id = ?').get(discordId);
  if (!m) return null;
  return { ...m, nebula: getNebula(m.nebula_id), rank: rankFor(m.reputation) };
}

export function createNebula(leaderId, name, guildId = null) {
  const me = getPlayer(leaderId);
  if (!me) throw new Error('Register first with /register.');
  if (memberOf(leaderId, guildId)) throw new Error('Already sworn to a nebula. Leave it first.');
  const id = `neb_${randomUUID().slice(0, 6)}`;
  ensureRow(id, name.slice(0, 32), leaderId);
  getDb().prepare('INSERT INTO nebula_members (nebula_id, discord_id, reputation, guild_id) VALUES (?,?,?,?)').run(id, leaderId, 5, guildId);
  nebulaLog(null, id, 'founded', `${me.name} founded ${name}.`);
  return memberOf(leaderId, guildId);
}

export function joinNebula(discordId, nebulaId, guildId = null) {
  const me = getPlayer(discordId);
  if (!me) throw new Error('Register first with /register.');
  if (memberOf(discordId, guildId)) throw new Error('Already sworn to a nebula. Leave it first.');
  const exists = getDb().prepare('SELECT id FROM nebulas WHERE id = ?').get(nebulaId) || nebulaDef(nebulaId);
  if (!exists) throw new Error('No such nebula. Seeded factions: iron_gate, veiled_ledger.');
  const neb = getNebula(nebulaId);
  getDb().prepare('INSERT INTO nebula_members (nebula_id, discord_id, reputation, guild_id) VALUES (?,?,?,?)').run(nebulaId, discordId, 5, guildId);
  nebulaLog(null, nebulaId, 'joined', `${me.name} joined ${neb.name}. (+5 rep)`);
  return memberOf(discordId, guildId);
}

export function leaveNebula(discordId, guildId) {
  const db = getDb();
  const m = memberOf(discordId, guildId);
  if (!m) throw new Error('Sworn to no nebula.');
  const wasRank = m.rank;
  db.prepare('DELETE FROM nebula_members WHERE nebula_id = ? AND discord_id = ? AND COALESCE(guild_id, ?) = ?').run(m.nebula_id, discordId, guildId, guildId);
  const left = db.prepare('SELECT COUNT(*) v FROM nebula_members WHERE nebula_id = ?').get(m.nebula_id).v;
  const me = getPlayer(discordId);
  let storyLine = '';
  if (['Member', 'Trusted Member', 'Faction Asset'].includes(wasRank)) {
    // Walking away from power becomes a Story.
    const def = storyFromAchievement('refused_nebula');
    db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(discordId, def.id);
    mintStoryCard(db, discordId, { card_id: `${def.id}@${m.nebula_id}`, name: `[${def.name}]`, scenario_id: '—', effect: `${me?.name} refused ${m.nebula.name} at the height of belonging.`, power: def.power });
    storyLine = ` Story gained: [${def.name}].`;
  }
  if (left === 0 && !nebulaDef(m.nebula_id)) {
    db.prepare('DELETE FROM nebulas WHERE id = ?').run(m.nebula_id);
  }
  nebulaLog(guildId, m.nebula_id, 'left', `${me?.name} left ${m.nebula.name}.${storyLine}`);
  return storyLine;
}

export function addNebulaRep(discordId, delta, guildId = null) {
  const m = memberOf(discordId, guildId);
  if (!m) return null;
  const next = m.reputation + delta;
  getDb().prepare('UPDATE nebula_members SET reputation = ? WHERE nebula_id = ? AND discord_id = ? AND COALESCE(guild_id, ?) = ?').run(next, m.nebula_id, discordId, guildId, guildId);
  // Ascension becomes a Story.
  if (rankFor(next) === 'Faction Asset' && rankFor(m.reputation) !== 'Faction Asset') {
    const db = getDb();
    const def = storyFromAchievement('nebula_asset');
    db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(discordId, def.id);
    mintStoryCard(db, discordId, { card_id: `${def.id}@${m.nebula_id}`, name: `[${def.name}]`, scenario_id: '—', effect: `${m.nebula.name} named them an asset.`, power: def.power });
  }
  return next;
}

export function donate(discordId, amount, guildId = null) {
  const m = memberOf(discordId, guildId);
  if (!m) throw new Error('Sworn to no nebula.');
  const p = getPlayer(discordId);
  if (amount <= 0 || amount > p.coins) throw new Error('Cannot donate that amount.');
  updatePlayer(discordId, { coins: p.coins - amount });
  getDb().prepare('UPDATE nebulas SET treasury = treasury + ? WHERE id = ?').run(amount, m.nebula_id);
  bumpCounter(discordId, 'donations', amount);
  const rep = addNebulaRep(discordId, Math.floor(amount / 100), guildId);
  nebulaLog(null, m.nebula_id, 'treasury', `${p.name} donated ${amount} coins.`);
  return rep;
}

export function aid(discordId, guildId = null) {
  const m = memberOf(discordId, guildId);
  if (!m) throw new Error('Sworn to no nebula.');
  if (!meetsRank(m.reputation, MIN_AID_RANK)) throw new Error(`Emergency aid requires rank ${MIN_AID_RANK}+ (you are ${m.rank}).`);
  const now = Date.now();
  if (m.last_aid_at && now - m.last_aid_at < AID_COOLDOWN_MS) throw new Error('The faction has already spent its mercy today.');
  const neb = getNebula(m.nebula_id);
  if (neb.treasury < AID_COST) throw new Error(`Faction treasury cannot cover aid (${AID_COST} coins).`);
  const p = getPlayer(discordId);
  getDb().prepare('UPDATE nebulas SET treasury = treasury - ? WHERE id = ?').run(AID_COST, m.nebula_id);
  getDb().prepare('UPDATE nebula_members SET last_aid_at = ? WHERE nebula_id = ? AND discord_id = ? AND COALESCE(guild_id, ?) = ?').run(now, m.nebula_id, discordId, guildId, guildId);
  updatePlayer(discordId, { hp: p.max_hp, energy: p.max_energy });
  nebulaLog(null, m.nebula_id, 'aid', `${p.name} received emergency aid.`);
  return true;
}

export function nebulaLog(guildId, nebulaId, kind, summary) {
  getDb().prepare('INSERT INTO nebula_history (guild_id, nebula_id, kind, summary) VALUES (?,?,?,?)').run(guildId, nebulaId, kind, summary);
}

export function nebulaHistory(nebulaId, limit = 8) {
  return getDb().prepare('SELECT * FROM nebula_history WHERE nebula_id = ? ORDER BY id DESC LIMIT ?').all(nebulaId, limit);
}

// Nebula <-> nebula state, stored canonically (a<b).
function key2(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function relationState(guildId, a, b) {
  if (a === b) return 'Self';
  const [x, y] = key2(a, b);
  const row = getDb().prepare('SELECT state FROM nebula_relationships WHERE guild_id = ? AND nebula_a = ? AND nebula_b = ?').get(guildId, x, y);
  // Seeded rivals start Competitive.
  if (!row) {
    const defs = new Set([a, b]);
    const seeded = defs.has('iron_gate') && defs.has('veiled_ledger');
    return seeded ? 'Competitive' : 'Neutral';
  }
  return row.state;
}

export function setRelationState(guildId, a, b, state) {
  const [x, y] = key2(a, b);
  getDb().prepare('INSERT INTO nebula_relationships (guild_id, nebula_a, nebula_b, state) VALUES (?,?,?,?) ON CONFLICT(guild_id,nebula_a,nebula_b) DO UPDATE SET state=?')
    .run(guildId, x, y, state, state);
}

export function shiftRelation(guildId, a, b, steps) {
  const next = shiftState(relationState(guildId, a, b), steps);
  setRelationState(guildId, a, b, next);
  return next;
}

export function allRelations(guildId, nebulaId) {
  return allNebulaDefs().filter((n) => n.id !== nebulaId).map((n) => ({ with: n.id, name: n.name, state: relationState(guildId, nebulaId, n.id) }));
}

// Hidden agendas
export function unrevealedAgendas(guildId, nebulaId) {
  const known = new Set(getDb().prepare('SELECT agenda_id FROM nebula_secrets WHERE guild_id = ? AND nebula_id = ?').all(guildId, nebulaId).map((r) => r.agenda_id));
  return agendas.filter((a) => a.nebula === nebulaId && !known.has(a.id));
}

export function revealAgenda(guildId, nebulaId, revealedBy) {
  const pool = unrevealedAgendas(guildId, nebulaId);
  if (!pool.length) return null;
  const agenda = pool[0];
  getDb().prepare('INSERT INTO nebula_secrets (guild_id, nebula_id, agenda_id, revealed_by) VALUES (?,?,?,?)').run(guildId, nebulaId, agenda.id, revealedBy);
  return agenda;
}

export function revealedAgendas(guildId, nebulaId) {
  const ids = new Set(getDb().prepare('SELECT agenda_id FROM nebula_secrets WHERE guild_id = ? AND nebula_id = ?').all(guildId, nebulaId).map((r) => r.agenda_id));
  return agendas.filter((a) => ids.has(a.id));
}

// Global Nebula, local oaths: every server watching this faction.
export function nebulaServers(nebulaId) {
  return getDb().prepare('SELECT guild_id, COUNT(*) members FROM nebula_members WHERE nebula_id = ? GROUP BY guild_id ORDER BY members DESC').all(nebulaId)
    .map((r) => ({ guild: r.guild_id || 'legacy', members: r.members }));
}
