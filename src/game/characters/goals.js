import { getDb } from '../../database/db.js';
import { CHARACTER_DEFS } from './system.js';

// Goal progress derived from the same world history players create. Pure eval + store.
export function signalCounts(guildId) {
  const db = getDb();
  return {
    alters: db.prepare('SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1').get(guildId).v,
    clears: db.prepare(`SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND kind = 'scenario_clear'`).get(guildId).v,
    public_shares: db.prepare(`SELECT COUNT(*) v FROM player_knowledge pk WHERE pk.scope = 'public'`).get().v,
    world_events: db.prepare('SELECT COUNT(*) v FROM world_events WHERE guild_id = ?').get(guildId).v,
    protects: db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE choice IN ('help','forewarn')`).get().v,
    trust_events: db.prepare('SELECT COUNT(*) v FROM npc_trust WHERE guild_id = ?').get(guildId).v,
  };
}

export function ensureGoals(guildId, charId) {
  const db = getDb();
  for (const goal of CHARACTER_DEFS[charId]?.goals || []) {
    db.prepare('INSERT INTO character_goals (guild_id, char_id, goal) VALUES (?,?,?) ON CONFLICT(guild_id,char_id,goal) DO NOTHING').run(guildId, charId, goal);
  }
  return db.prepare('SELECT * FROM character_goals WHERE guild_id = ? AND char_id = ?').all(guildId, charId);
}

export function setGoalProgress(guildId, charId, goal, progress) {
  ensureGoals(guildId, charId);
  getDb().prepare('UPDATE character_goals SET progress = ? WHERE guild_id = ? AND char_id = ? AND goal = ?').run(progress, guildId, charId, goal);
}

export function goalsOf(guildId, charId) {
  ensureGoals(guildId, charId);
  return getDb().prepare('SELECT * FROM character_goals WHERE guild_id = ? AND char_id = ?').all(guildId, charId);
}
