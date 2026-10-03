import { getDb } from '../../database/db.js';
import { adjustTrust } from '../world/store.js';
import { deriveState } from './system.js';

// Relationships across five axes. Trust reuses the npc_trust table you already fill.
export function getAxes(guildId, charId, targetId) {
  const db = getDb();
  const trust = db.prepare('SELECT trust FROM npc_trust WHERE guild_id = ? AND npc_id = ? AND discord_id = ?').get(guildId, charId, targetId)?.trust || 0;
  const row = db.prepare('SELECT * FROM character_relationships WHERE guild_id = ? AND char_id = ? AND target_id = ?').get(guildId, charId, targetId);
  return {
    trust,
    fear: row?.fear || 0,
    respect: row?.respect || 0,
    interest: row?.interest || 0,
    hostility: row?.hostility || 0,
  };
}

export function adjustAxis(guildId, charId, targetId, axis, delta) {
  if (axis === 'trust') {
    adjustTrust(guildId, charId, targetId, delta);
    return getAxes(guildId, charId, targetId);
  }
  const db = getDb();
  db.prepare('INSERT INTO character_relationships (guild_id, char_id, target_id) VALUES (?,?,?) ON CONFLICT(guild_id,char_id,target_id) DO NOTHING').run(guildId, charId, targetId);
  const allowed = ['fear', 'respect', 'interest', 'hostility'];
  if (!allowed.includes(axis)) throw new Error('Unknown axis.');
  db.prepare(`UPDATE character_relationships SET ${axis} = MAX(0, MIN(100, ${axis} + ?)) WHERE guild_id = ? AND char_id = ? AND target_id = ?`)
    .run(delta, guildId, charId, targetId);
  return getAxes(guildId, charId, targetId);
}

export function relationshipState(guildId, charId, targetId) {
  return deriveState(getAxes(guildId, charId, targetId));
}

export function statesFor(discordId, guildId, charIds = ['kim_dokja', 'survivor_17', 'plaza_runner']) {
  return Object.fromEntries(charIds.map((c) => [c, relationshipState(guildId, c, discordId)]));
}
