import { getDb } from '../../database/db.js';
import { config } from '../../config.js';
import { recordEvent } from '../world/store.js';

// Delayed consequences: what you did hours ago surfaces later.
// Nothing here rewrites history — echoes only add new events.
export function scheduleEcho(guildId, kind, summary, delayMs, data = {}) {
  if (!guildId || guildId === 'dm') return null;
  const r = getDb().prepare('INSERT INTO pending_echoes (guild_id, fire_at, kind, summary, data) VALUES (?,?,?,?,?)')
    .run(guildId, Date.now() + delayMs, kind, summary, JSON.stringify(data));
  return r.lastInsertRowid;
}

export function dueEchoes(guildId, now = Date.now()) {
  return getDb().prepare(`SELECT * FROM pending_echoes WHERE guild_id = ? AND status = 'pending' AND fire_at <= ? ORDER BY fire_at LIMIT 5`).all(guildId, now);
}

export function deliverEcho(id) {
  const db = getDb();
  const echo = db.prepare('SELECT * FROM pending_echoes WHERE id = ?').get(id);
  if (!echo || echo.status !== 'pending') return null; // exactly once
  db.prepare(`UPDATE pending_echoes SET status = 'delivered' WHERE id = ?`).run(id);
  recordEvent(echo.guild_id, { kind: 'world_event', actorId: null, summary: echo.summary });
  return echo;
}

export function setStreamChannel(guildId, channelId) {
  getDb().prepare('INSERT INTO guild_config (guild_id, stream_channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET stream_channel_id=?')
    .run(guildId, channelId, channelId);
}

export function getStreamChannel(guildId) {
  return getDb().prepare('SELECT stream_channel_id FROM guild_config WHERE guild_id = ?').get(guildId)?.stream_channel_id || null;
}

// Play channel gate: when set, the bot only answers here (DMs always open).
export function setPlayChannel(guildId, channelId) {
  getDb().prepare('INSERT INTO guild_config (guild_id, allowed_channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET allowed_channel_id=?')
    .run(guildId, channelId, channelId);
}

export function clearPlayChannel(guildId) {
  getDb().prepare('INSERT INTO guild_config (guild_id, allowed_channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET allowed_channel_id=?')
    .run(guildId, null, null);
}

export function getPlayChannel(guildId) {
  if (!guildId) return null;
  return getDb().prepare('SELECT allowed_channel_id FROM guild_config WHERE guild_id = ?').get(guildId)?.allowed_channel_id || null;
}

export function channelAllowed(allowedId, channelId) {
  if (!allowedId) return true; // no restriction configured
  return allowedId === channelId;
}

// Per-server prefix. Falls back to the global default (`orv`).
export function getPrefix(guildId) {
  if (!guildId) return config.prefix;
  try {
    return getDb().prepare('SELECT prefix FROM guild_config WHERE guild_id = ?').get(guildId)?.prefix || config.prefix;
  } catch {
    return config.prefix;
  }
}

export function setPrefix(guildId, prefix) {
  const clean = String(prefix || '').trim().toLowerCase();
  if (!/^[a-z0-9?!$%&*~#]{1,5}$/.test(clean)) {
    throw new Error('Prefix must be 1–5 characters: letters, digits, or ?!$%&*~# (no spaces).');
  }
  getDb().prepare('INSERT INTO guild_config (guild_id, prefix) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET prefix=?')
    .run(guildId, clean, clean);
  return clean;
}

export function clearPrefix(guildId) {
  getDb().prepare('INSERT INTO guild_config (guild_id, prefix) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET prefix=?')
    .run(guildId, null, null);
}

// Echo seeds, called from event flows. Delays keep them surprising, not instant.
export const echoFor = {
  altered: (playerName, scenarioId) => ({
    kind: 'altered_echo',
    summary: `🌊 Aftershock: ${playerName}'s meddling in Scenario ${scenarioId} resurfaces — someone downstream is asking questions.`,
    delayMs: 45 * 60000,
  }),
  underdog: (playerName) => ({
    kind: 'underdog_echo',
    summary: `🌊 Aftershock: constellations are still arguing about ${playerName}'s impossible win. Wagers reference it.`,
    delayMs: 90 * 60000,
  }),
  fallen: (playerName) => ({
    kind: 'memorial_echo',
    summary: `🕯️ A quiet memorial for ${playerName} appeared where they fell. Strangers leave coins.`,
    delayMs: 30 * 60000,
  }),
  anomaly: (guildId) => ({
    kind: 'anomaly_echo',
    summary: `🌊 Aftershock: the canon breach keeps spreading hairline cracks. The Director takes notes.`,
    delayMs: 120 * 60000,
  }),
};
