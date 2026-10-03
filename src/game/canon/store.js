import { getDb } from '../../database/db.js';

export const DOKJA_ID = 'kim_dokja';
// What Dokja knows from canon — seeded per server. Players may know things he doesn't
// once the timeline diverges (tier 'altered' records what the divergence taught him).
const CANON_SEED = ['foreknow_001', 'foreknow_002', 'pattern_lurker', 'danger_east', 'value_east'];

export function getDokja(guildId) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM canon_npcs WHERE guild_id = ? AND npc_id = ?').get(guildId, DOKJA_ID);
  if (!row) {
    db.prepare('INSERT INTO canon_npcs (guild_id, npc_id, location) VALUES (?,?,?)').run(guildId, DOKJA_ID, 'Unknown');
    const seed = db.prepare('INSERT OR IGNORE INTO npc_knowledge (guild_id, npc_id, knowledge_id, tier) VALUES (?,?,?,?)');
    for (const k of CANON_SEED) seed.run(guildId, DOKJA_ID, k, 'canon');
    row = db.prepare('SELECT * FROM canon_npcs WHERE guild_id = ? AND npc_id = ?').get(guildId, DOKJA_ID);
  }
  return row;
}

export function addAttention(guildId, delta) {
  const d = getDokja(guildId);
  const next = Math.max(0, d.attention + delta);
  getDb().prepare('UPDATE canon_npcs SET attention = ? WHERE guild_id = ? AND npc_id = ?').run(next, guildId, DOKJA_ID);
  return next;
}

export function setDokjaLocation(guildId, location) {
  getDokja(guildId);
  getDb().prepare('UPDATE canon_npcs SET location = ? WHERE guild_id = ? AND npc_id = ?').run(location, guildId, DOKJA_ID);
}

export function dokjaKnows(guildId, knowledgeId) {
  return getDb().prepare('SELECT tier FROM npc_knowledge WHERE guild_id = ? AND npc_id = ? AND knowledge_id = ?')
    .get(guildId, DOKJA_ID, knowledgeId);
}

export function grantDokjaKnowledge(guildId, knowledgeId, tier = 'learned') {
  const r = getDb().prepare('INSERT OR IGNORE INTO npc_knowledge (guild_id, npc_id, knowledge_id, tier) VALUES (?,?,?,?)')
    .run(guildId, DOKJA_ID, knowledgeId, tier);
  return r.changes > 0;
}

export function alterCount(guildId) {
  return getDb().prepare(`SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1`).get(guildId).v;
}
