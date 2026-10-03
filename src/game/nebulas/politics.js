// Sponsor politics: what one signing means for every faction. Pure.
export function nebulaOfConstellation(constellationId, nebulaDefs) {
  return nebulaDefs.find((n) => (n.constellations || []).includes(constellationId))?.id || null;
}

export function rivalsOf(nebulaId, nebulaDefs, relationships) {
  // relationships: [{with, state}] — rivals are Competitive or worse.
  return (relationships || []).filter((r) => ['Competitive', 'Hostile', 'At War'].includes(r.state)).map((r) => r.with);
}

// Signing with a constellation honors its nebula and strains rival ones.
export function signingFallout({ constellationId, nebulaDefs, relationships }) {
  const home = nebulaOfConstellation(constellationId, nebulaDefs);
  const shifts = [];
  if (home) {
    shifts.push({ nebula: home, repDelta: 10, note: 'honored by sponsorship' });
    for (const r of rivalsOf(home, nebulaDefs, relationships)) {
      shifts.push({ nebula: r, relationShift: 1, note: 'strained by rival sponsorship' });
    }
  }
  return { home, shifts };
}

const EVENT_FLAVORS = [
  ({ a, b, player }) => `SPONSOR DISPUTE — ${a} has publicly claimed ${player}, previously favored by ${b}. Two constellations are watching. Probability distortion detected.`,
  ({ a, b, player }) => `NEBULA DEMAND — ${b} demands ${a} release its hold on ${player}. The stream holds its breath.`,
  ({ a, b }) => `CONSTELLATION DUEL — champions of ${a} and ${b} will settle the slight in scenario combat. Wagers are already opening.`,
  ({ a, player }) => `INCARNATION RECRUITMENT — ${a} has marked ${player} as an asset worth protecting. Other factions take note.`,
  ({ a, b }) => `SCENARIO INTERFERENCE — ${a} moves against ${b}'s designs in the coming scenario. Expect altered conditions.`,
];

export function politicalEvent({ homeName, rivalName, playerName, kind, rng = Math.random }) {
  if (kind === 'broken') {
    return `RESOURCE CLAIM — ${homeName} repossesses the support it gave ${playerName}. The ledger is balanced in silence.`;
  }
  const pool = homeName && rivalName ? EVENT_FLAVORS : EVENT_FLAVORS.slice(3, 4);
  const pick = pool[Math.floor(rng() * pool.length)];
  return `[STAR STREAM ALERT] ${pick({ a: homeName || 'A power', b: rivalName || 'a rival', player: playerName })}`;
}
