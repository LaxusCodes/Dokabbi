import { getDb } from '../database/db.js';

// Spam control: per-player, per-action, restart-safe. Times in ms.
// DB-backed so restarts don't reset it. Burst guard below is in-memory
// for duplicate clicks on the same unresolved request.
export function checkCooldown(discordId, key, ms, now = Date.now()) {
  const row = getDb().prepare('SELECT expires_at FROM cooldowns WHERE discord_id = ? AND key = ?').get(discordId, key);
  if (!row) return 0;
  return Math.max(0, row.expires_at - now);
}

export function setCooldown(discordId, key, ms, now = Date.now()) {
  getDb().prepare('INSERT INTO cooldowns (discord_id, key, expires_at) VALUES (?,?,?) ON CONFLICT(discord_id,key) DO UPDATE SET expires_at=?')
    .run(discordId, key, now + ms, now + ms);
}

// Returns an error string when gated, else null (and stamps the cooldown).
export function gate(discordId, key, ms, now = Date.now()) {
  const left = checkCooldown(discordId, key, ms, now);
  if (left > 0) return cooldownMessage(left, key);
  setCooldown(discordId, key, ms, now);
  return null;
}

const ACTION_LABEL = {
  encounter: 'encounter',
  scenario: 'scenario',
  chapter: 'chapter',
  pve: 'battle',
  pvp_challenge: 'duel challenge',
  duel_call: 'duel',
  wager: 'wager',
  observe: 'vision',
  know_share: 'revelation',
  summon: 'summon',
};

export function cooldownMessage(left, action = 'encounter') {
  const s = Math.ceil(left / 1000);
  const text = s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  const label = ACTION_LABEL[action] || action;
  return `🌌 **The Stream is silent.**\nYour previous ${label} has not yet faded into history.\n⏳ You may seek another ${label} in **${text}**.`;
}

export const COOLDOWNS = {
  encounter: 10 * 60_000,
  scenario: 10 * 60_000,
  chapter: 10 * 60_000,
  pve: 10 * 60_000,
  pvp_challenge: 10 * 60_000,
  duel_call: 10 * 60_000,
  wager: 10 * 60_000,
  observe: 5 * 60_000,
  know_share: 5 * 60_000,
  summon: 10 * 60_000,
};

// Burst guard: same player + same action + unresolved request → reject duplicate.
// Prevents double-clicks on buttons/selects creating two encounters/battles.
// In-memory only (short TTL); the DB cooldown above is the persistent guard.
const inflight = new Map();

export function tryBurst(discordId, key, ttlMs = 15000, now = Date.now()) {
  const k = `${discordId}:${key}`;
  const exp = inflight.get(k);
  if (exp && exp > now) return false;
  inflight.set(k, now + ttlMs);
  return true;
}

export function clearBurst(discordId, key) {
  inflight.delete(`${discordId}:${key}`);
}

export function burstMessage() {
  return `🌌 **The Stream blinks.**\nYour last action has not yet resolved — the ink is still wet.\n⏳ Please wait a moment before trying again.`;
}
