import { getDb } from '../../database/db.js';
import { applyTrust } from './memory.js';

// One Discord server = one shared Star Stream. Persistence for streams,
// scenario instances, world events, knowledge ownership, NPC memory.
export function getOrCreateStream(guildId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM server_streams WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO server_streams (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM server_streams WHERE guild_id = ?').get(guildId);
  }
  return row;
}

export function advanceStream(guildId, scenarioId) {
  getOrCreateStream(guildId);
  getDb().prepare('UPDATE server_streams SET current_scenario = ? WHERE guild_id = ?').run(scenarioId, guildId);
}

export function getOrCreateInstance(guildId, scenarioId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM scenario_instances WHERE guild_id = ? AND scenario_id = ?').get(guildId, scenarioId);
  if (!row) {
    db.prepare('INSERT INTO scenario_instances (guild_id, scenario_id) VALUES (?,?)').run(guildId, scenarioId);
    row = db.prepare('SELECT * FROM scenario_instances WHERE guild_id = ? AND scenario_id = ?').get(guildId, scenarioId);
  }
  return row;
}

export function markAltered(guildId, scenarioId, byId, summary) {
  const db = getDb();
  getOrCreateInstance(guildId, scenarioId);
  db.prepare('UPDATE scenario_instances SET altered = 1, altered_by = ?, summary = ? WHERE guild_id = ? AND scenario_id = ?')
    .run(byId, summary, guildId, scenarioId);
}

export function recordEvent(guildId, { kind, actorId = null, summary, data = {} }) {
  if (!guildId) return null;
  getOrCreateStream(guildId);
  const r = getDb()
    .prepare('INSERT INTO world_events (guild_id, kind, actor_id, summary, data) VALUES (?,?,?,?,?)')
    .run(guildId, kind, actorId, summary, JSON.stringify(data));
  return r.lastInsertRowid;
}

export function recentEvents(guildId, limit = 8) {
  if (!guildId) return [];
  return getDb().prepare('SELECT * FROM world_events WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, limit);
}

// Knowledge ownership
export function grantKnowledge(discordId, knowledgeId, source = 'observe') {
  const db = getDb();
  const r = db.prepare('INSERT OR IGNORE INTO player_knowledge (discord_id, knowledge_id, source) VALUES (?,?,?)')
    .run(discordId, knowledgeId, source);
  return r.changes > 0;
}

export function playerKnowledgeIds(discordId) {
  return getDb().prepare('SELECT knowledge_id FROM player_knowledge WHERE discord_id = ?').all(discordId).map((r) => r.knowledge_id);
}

export function playerKnowledge(discordId) {
  return getDb().prepare('SELECT * FROM player_knowledge WHERE discord_id = ?').all(discordId);
}

export function setKnowledgeScope(discordId, knowledgeId, scope) {
  const r = getDb().prepare('UPDATE player_knowledge SET scope = ? WHERE discord_id = ? AND knowledge_id = ?')
    .run(scope, discordId, knowledgeId);
  if (!r.changes) throw new Error('You do not hold that knowledge.');
}

// NPC memory: per-server state + per-player trust
export function adjustTrust(guildId, npcId, discordId, delta) {
  const db = getDb();
  const row = db.prepare('SELECT trust FROM npc_trust WHERE guild_id = ? AND npc_id = ? AND discord_id = ?').get(guildId, npcId, discordId);
  const next = applyTrust(row?.trust || 0, delta);
  db.prepare('INSERT INTO npc_trust (guild_id, npc_id, discord_id, trust) VALUES (?,?,?,?) ON CONFLICT(guild_id,npc_id,discord_id) DO UPDATE SET trust=?')
    .run(guildId, npcId, discordId, next, next);
  return next;
}

export function npcTrustFor(guildId, npcId, discordId) {
  const row = getDb().prepare('SELECT trust FROM npc_trust WHERE guild_id = ? AND npc_id = ? AND discord_id = ?').get(guildId, npcId, discordId);
  return row?.trust || 0;
}

export function appendKnownEvent(guildId, npcId, event) {
  const db = getDb();
  const row = db.prepare('SELECT known_events FROM npc_states WHERE guild_id = ? AND npc_id = ?').get(guildId, npcId);
  const events = row ? JSON.parse(row.known_events) : [];
  events.push(event);
  db.prepare('INSERT INTO npc_states (guild_id, npc_id, known_events) VALUES (?,?,?) ON CONFLICT(guild_id,npc_id) DO UPDATE SET known_events=?')
    .run(guildId, npcId, JSON.stringify(events), JSON.stringify(events));
  return events;
}

// Server flags: permanent consequences of collective choices.
export function setFlag(guildId, key, value) {
  getDb().prepare('INSERT INTO server_flags (guild_id, key, value) VALUES (?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=?')
    .run(guildId, key, value, value);
}

export function allFlags(guildId) {
  const rows = getDb().prepare('SELECT key, value FROM server_flags WHERE guild_id = ?').all(guildId);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function allInstances(guildId) {
  return getDb().prepare('SELECT * FROM scenario_instances WHERE guild_id = ?').all(guildId);
}
