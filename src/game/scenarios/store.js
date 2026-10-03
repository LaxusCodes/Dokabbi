import { getDb } from '../../database/db.js';

// Global scenario lifecycle persistence.
export function startGlobal(guildId, { scenarioId, aLabel, bLabel, minutes = 45 }) {
  const db = getDb();
  const open = db.prepare(`SELECT * FROM global_scenarios WHERE guild_id = ? AND status = 'open'`).get(guildId);
  if (open) throw new Error('A global scenario is already open. Resolve it first.');
  const endsAt = Date.now() + minutes * 60_000;
  const r = db.prepare('INSERT INTO global_scenarios (guild_id, scenario_id, a_label, b_label, ends_at) VALUES (?,?,?,?,?)')
    .run(guildId, scenarioId, aLabel.slice(0, 80), bLabel.slice(0, 80), endsAt);
  return db.prepare('SELECT * FROM global_scenarios WHERE id = ?').get(r.lastInsertRowid);
}

export function activeGlobal(guildId) {
  return getDb().prepare(`SELECT * FROM global_scenarios WHERE guild_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`).get(guildId);
}

export function castVote(globalId, discordId, choice) {
  if (!['A', 'B'].includes(choice)) throw new Error('Vote A or B.');
  getDb().prepare('INSERT INTO global_votes (global_id, discord_id, choice) VALUES (?,?,?) ON CONFLICT(global_id,discord_id) DO UPDATE SET choice=?')
    .run(globalId, discordId, choice, choice);
}

export function votesFor(globalId) {
  return getDb().prepare('SELECT discord_id, choice FROM global_votes WHERE global_id = ?').all(globalId);
}

export function closeGlobal(globalId, consequenceTitle) {
  getDb().prepare(`UPDATE global_scenarios SET status = 'resolved', consequence = ? WHERE id = ?`).run(consequenceTitle, globalId);
}

export function pastGlobals(guildId, limit = 5) {
  return getDb().prepare('SELECT * FROM global_scenarios WHERE guild_id = ? AND status = ? ORDER BY id DESC LIMIT ?').all(guildId, 'resolved', limit);
}

export function registeredCount() {
  return getDb().prepare('SELECT COUNT(*) v FROM players').get().v;
}
