import { getDb } from '../../database/db.js';

export const NAME_TAKEN = 'That incarnation name is already recorded in the Stream.';

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

export function nameTakenMessage() {
  return `🌌 **The Stream rejects the name.**\n${NAME_TAKEN}`;
}

function takenError() {
  const e = new Error(NAME_TAKEN);
  e.code = 'NAME_TAKEN';
  return e;
}

export function getPlayer(discordId) {
  return getDb().prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
}
export function createPlayer(discordId, name) {
  const db = getDb();
  if (getPlayer(discordId)) throw new Error('Already registered');
  const clean = String(name || '').trim().slice(0, 32);
  const norm = clean.toLowerCase();
  if (!norm) throw new Error('Name cannot be empty.');
  const existing = db.prepare('SELECT discord_id FROM players WHERE name_norm = ?').get(norm);
  if (existing) throw takenError();
  try {
    db.prepare('INSERT INTO players (discord_id, name, name_norm) VALUES (?, ?, ?)').run(discordId, clean, norm);
  } catch (e) {
    if (e?.code === 'NAME_TAKEN') throw e;
    if (e?.code?.includes?.('CONSTRAINT') || /UNIQUE/i.test(e?.message || '')) throw takenError();
    throw e;
  }
  db.prepare("INSERT INTO player_attributes (discord_id, attribute_id, grade) VALUES (?, 'novice_reader', 'Rare')").run(discordId);
  return getPlayer(discordId);
}
export function updatePlayer(discordId, fields) {
  const patch = { ...fields };
  if (patch.name !== undefined) {
    const clean = String(patch.name || '').trim().slice(0, 32);
    const norm = clean.toLowerCase();
    if (!norm) throw new Error('Name cannot be empty.');
    const clash = getDb().prepare('SELECT discord_id FROM players WHERE name_norm = ? AND discord_id != ?').get(norm, discordId);
    if (clash) throw takenError();
    patch.name = clean;
    patch.name_norm = norm;
  }
  const keys = Object.keys(patch);
  const set = keys.map((k) => `${k} = ?`).join(', ');
  getDb().prepare(`UPDATE players SET ${set} WHERE discord_id = ?`).run(...Object.values(patch), discordId);
  return getPlayer(discordId);
}
