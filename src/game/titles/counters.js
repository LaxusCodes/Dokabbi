import { getDb } from '../../database/db.js';

export function bumpCounter(discordId, key, delta = 1) {
  getDb().prepare('INSERT INTO title_counters (discord_id, key, value) VALUES (?,?,?) ON CONFLICT(discord_id,key) DO UPDATE SET value=value+?')
    .run(discordId, key, delta, delta);
}

export function countersOf(discordId) {
  return Object.fromEntries(getDb().prepare('SELECT key, value FROM title_counters WHERE discord_id = ?').all(discordId).map((r) => [r.key, r.value]));
}
