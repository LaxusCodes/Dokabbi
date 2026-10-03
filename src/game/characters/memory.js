import { getDb } from '../../database/db.js';

// Memory: what a character actually remembers. Nothing more.
// NPCs learn knowledge ONLY through exposed channels (mayLearn) —
// never the whole database. Asymmetry is preserved.
export function remember(guildId, charId, key, value) {
  getDb().prepare('INSERT INTO character_memory (guild_id, char_id, key, value, updated_at) VALUES (?,?,?,?,datetime(\'now\')) ON CONFLICT(guild_id,char_id,key) DO UPDATE SET value=?, updated_at=datetime(\'now\')')
    .run(guildId, charId, key, String(value), String(value));
}

export function recall(guildId, charId, key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM character_memory WHERE guild_id = ? AND char_id = ? AND key = ?').get(guildId, charId, key);
  return row ? row.value : fallback;
}

export function bumpMemory(guildId, charId, key, delta = 1) {
  const cur = parseInt(recall(guildId, charId, key, '0'), 10) || 0;
  remember(guildId, charId, key, cur + delta);
  return cur + delta;
}

export function memoriesOf(guildId, charId) {
  return getDb().prepare('SELECT key, value FROM character_memory WHERE guild_id = ? AND char_id = ?').all(guildId, charId);
}

// Pure rule: learnable only if some owner holds it publicly,
// or a broadcast carried it into the open.
export function mayLearn(scopes = [], broadcastMentioned = false) {
  if (broadcastMentioned) return true;
  return scopes.includes('public');
}

export function knows(guildId, charId, knowledgeId) {
  return recall(guildId, charId, `knows:${knowledgeId}`) === '1';
}

export function markKnown(guildId, charId, knowledgeId) {
  remember(guildId, charId, `knows:${knowledgeId}`, '1');
}
