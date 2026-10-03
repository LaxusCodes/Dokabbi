import { getDb } from '../../database/db.js';
import { countersOf } from './counters.js';
import { gatherStats } from './queries.js';
import { computeDivergence } from '../canon/divergence.js';
import { relationshipState } from '../characters/relationships.js';
import { recordEvent } from '../world/store.js';
import { emTitle } from '../display/emojis.js';
import titles from '../../../data/titles.json' with { type: 'json' };

export const listTitles = () => titles;

// One merged stat sheet: live queries first, event counters fill the gaps.
export function titleStats(discordId, guildId) {
  const stats = { ...gatherStats(discordId, guildId), ...countersOf(discordId) };
  try {
    stats.divergence = computeDivergence(guildId).score;
  } catch { stats.divergence = 0; }
  try {
    const state = relationshipState(guildId, 'kim_dokja', discordId);
    stats.dokja_trusted = ['Trusted', 'Devoted'].includes(state) ? 1 : 0;
  } catch { stats.dokja_trusted = 0; }
  return stats;
}

export function checkTitle(def, stats) {
  for (const [k, n] of Object.entries(def.req?.counters || {})) {
    if ((stats[k] || 0) < n) return { met: false, progress: `${stats[k] || 0}/${n}` };
  }
  for (const [k, n] of Object.entries(def.req?.queries || {})) {
    if ((stats[k] || 0) < n) return { met: false, progress: `${stats[k] || 0}/${n}` };
  }
  return { met: true };
}

export function earnedTitles(discordId) {
  return getDb().prepare('SELECT title_id FROM player_titles WHERE discord_id = ?').all(discordId).map((r) => r.title_id);
}

// Evaluate everything; award the newly earned with a Stream announcement.
export function evaluateTitles(discordId, guildId) {
  const stats = titleStats(discordId, guildId);
  const owned = new Set(earnedTitles(discordId));
  const fresh = [];
  for (const def of titles) {
    if (owned.has(def.id)) continue;
    if (checkTitle(def, stats).met) {
      getDb().prepare('INSERT OR IGNORE INTO player_titles (discord_id, title_id) VALUES (?,?)').run(discordId, def.id);
      fresh.push(def);
    }
  }
  if (fresh.length && guildId && guildId !== 'dm') {
    const name = getDb().prepare('SELECT name FROM players WHERE discord_id = ?').get(discordId)?.name || discordId;
    recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `👑 ${name} earned: ${fresh.map((d) => `${emTitle(d.id, d.emoji)} ${d.name}`).join(', ')}.` });
  }
  return { fresh, stats };
}

export function titleProgress(discordId, guildId) {
  const stats = titleStats(discordId, guildId);
  const owned = new Set(earnedTitles(discordId));
  return titles.map((def) => ({ def, owned: owned.has(def.id), check: checkTitle(def, stats) }));
}
