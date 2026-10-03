import { getDb } from '../../database/db.js';
import constellations from '../../../data/constellations.json' with { type: 'json' };

// Constellation Sentiment: how the watching powers feel about one incarnation.
// In-world naming (never "likes"): Favorable / Neutral / Hostile.
// Bands sit on per-constellation favor: small gifts (+3/+5) accumulate toward
// Favorable at 10, while a single contract failure (-15) drops to Hostile.
export const FAVORABLE_AT = 10;
export const HOSTILE_BELOW = 0;

export const ICONS = {
  judge_embers: '🔥',
  veiled_trickster: '🎭',
  silent_warden: '🌙',
  whispering_broker: '💸',
};

export function iconOf(constellationId) {
  return ICONS[constellationId] || '❓';
}

export function nameOf(constellationId) {
  return constellations.find((c) => c.id === constellationId)?.name || constellationId;
}

export function sentimentOf(favor) {
  if ((favor || 0) >= FAVORABLE_AT) return 'favorable';
  if ((favor || 0) < HOSTILE_BELOW) return 'hostile';
  return 'neutral';
}

export function sentimentMark(sentiment, favor) {
  if (sentiment === 'favorable') return `👍 ${favor}`;
  if (sentiment === 'hostile') return `👎 ${favor}`;
  return `— ${favor}`;
}

export function favorOf(discordId, constellationId) {
  try {
    const row = getDb().prepare('SELECT favor FROM constellation_favor WHERE discord_id = ? AND constellation_id = ?')
      .get(discordId, constellationId);
    return row?.favor || 0;
  } catch {
    return 0;
  }
}

// Whole relationship at a glance. Rows cover EVERY known constellation
// (unknown powers read as Neutral 0) so /profile shows the full picture.
export function sentimentSummary(discordId) {
  const rows = constellations.map((c) => {
    const favor = favorOf(discordId, c.id);
    const sentiment = sentimentOf(favor);
    return { id: c.id, name: c.name, icon: iconOf(c.id), favor, sentiment, mark: sentimentMark(sentiment, favor) };
  });
  return {
    rows,
    total: rows.reduce((s, r) => s + r.favor, 0),
    favorable: rows.filter((r) => r.sentiment === 'favorable').length,
    hostile: rows.filter((r) => r.sentiment === 'hostile').length,
  };
}
