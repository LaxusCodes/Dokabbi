// Random encounters weighted by the living world. Pure table + picker.
export const ENCOUNTER_COST = 10;

export const ENCOUNTERS = {
  constellation_notice: { weight: 10, text: '🌌 Something in the sky turned its gaze your way. You feel it like a draft from a door you did not know was open. Favor +3 — the constellations notice when you are worth watching.' },
  npc_approach: { weight: 10, text: '👤 A figure steps from the crowd. Their eyes have catalogued you before you saw them. Trust +5 — in this world, being recognized is either a kindness or a sentence.' },
  broadcast: { weight: 8, text: '📡 A signal cuts through the noise — words you were not supposed to hear, from a server far away. The Stream carries everything, and everything is listening.' },
  probability_shift: { weight: 8, text: '⚠️ The numbers tilt. For a moment, 3 + 1 = 5, and the world accommodates the arithmetic. Probability +10 — the rules are suggestions today.' },
  discovery: { weight: 8, text: '🎴 Your fingers find something the world left in a drawer it forgot to lock. A memory, a fragment, a truth half-buried. It is yours now — and the Stream records the theft.' },
  sponsor_gift: { weight: 6, text: '⭐ A letter arrives with no return address and coins that smell like someone else\'s ambition. +250 coins. The constellation that sent this is keeping score of every transaction.' },
  dokja_sighting: { weight: 5, text: '👁 A presence you cannot name lingers at the edge of your perception. Kim Dokja was here — or he was not. He is very careful about the difference. Attention +2.' },
  toll: { weight: 5, text: '💸 The Ledger does not forget, and it does not forgive. 40 coins leave your hands and enter the architecture of the world. The Broker notes your compliance. Favor +2.' },
  quiet: { weight: 6, text: '🌫️ The patrol was unremarkable. You walked, you observed, you did not disturb anything. But the Stream does not count stillness as emptiness — +10 XP for surviving the quiet.' },
};

export function buildWeights(ctx = {}) {
  const w = Object.fromEntries(Object.entries(ENCOUNTERS).map(([k, v]) => [k, v.weight]));
  if (ctx.sponsored) {
    w.sponsor_gift += 8;
    w.constellation_notice += 4;
  } else {
    w.sponsor_gift = 0;
  }
  if ((ctx.maxTrust || 0) >= 10) w.npc_approach += 5;
  if ((ctx.disturbance || 0) >= 30) w.broadcast += 6;
  if ((ctx.probability || 100) < 60) w.probability_shift += 6;
  if ((ctx.divergence || 0) >= 20) w.dokja_sighting += 6;
  if (ctx.hasUndiscovered) w.discovery += 5;
  return w;
}

export function pickEncounter(weights, rng = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [id, w] of entries) {
    if ((r -= w) <= 0) return id;
  }
  return entries[entries.length - 1][0];
}
