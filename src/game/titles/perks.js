import { getDb } from '../../database/db.js';
import titles from '../../../data/titles.json' with { type: 'json' };

const byId = Object.fromEntries(titles.map((t) => [t.id, t]));

// 1 primary (full) + 2 secondaries (half). ctx gates conditional perks:
// {solo, party, gambit, altered, underdog, wounded, elite, peaceful, faction,
//  story, spectacle, rival, favorCtx, always:true}
export function activeTitles(discordId) {
  const row = getDb().prepare('SELECT * FROM title_slots WHERE discord_id = ?').get(discordId);
  if (!row) return { primary: null, secondaries: [] };
  return { primary: row.primary_id, secondaries: [row.secondary1, row.secondary2].filter(Boolean) };
}

export function setSlots(discordId, { primary = null, secondary1 = null, secondary2 = null } = {}) {
  const owned = new Set(getDb().prepare('SELECT title_id FROM player_titles WHERE discord_id = ?').all(discordId).map((r) => r.title_id));
  for (const id of [primary, secondary1, secondary2]) {
    if (id && !byId[id]) throw new Error(`No such title: ${id}.`);
    if (id && !owned.has(id)) throw new Error(`Unearned: ${byId[id]?.name || id}. Titles describe a lived life.`);
  }
  if (primary && (primary === secondary1 || primary === secondary2)) throw new Error('Primary must stand alone.');
  if (secondary1 && secondary1 === secondary2) throw new Error('Secondaries must differ.');
  getDb().prepare('INSERT INTO title_slots (discord_id, primary_id, secondary1, secondary2) VALUES (?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET primary_id=?, secondary1=?, secondary2=?')
    .run(discordId, primary, secondary1, secondary2, primary, secondary1, secondary2);
  return activeTitles(discordId);
}

// Sum applicable perks: {reward, power, energy, wager, favor} in percent/points.
export function perksFor(discordId, ctx = {}) {
  const { primary, secondaries } = activeTitles(discordId);
  const out = { reward: 0, power: 0, energy: 0, wager: 0, favor: 0 };
  const apply = (perk, mult) => {
    if (!perk || !applies(perk.when, ctx)) return;
    if (perk.kind in out) out[perk.kind] += perk.value * mult;
  };
  if (primary && byId[primary]) apply(byId[primary].perk, 1);
  for (const s of secondaries) if (byId[s]) apply(byId[s].perk, 0.5);
  return out;
}

function applies(when, ctx) {
  if (!when || when === 'always') return true;
  return Boolean(ctx[when]);
}
