// Party rules: sizes, roles, synergy. Pure — persistence in parties/store.js.
export function formationBonus(members) {
  const roles = new Set(members.map((m) => m.role).filter(Boolean));
  if (roles.size >= 3) return { name: 'Three-Person Formation', bonusPct: 10 };
  if (members.length >= 2) return { name: 'Duo Synergy', bonusPct: 5 };
  return { name: 'No Formation', bonusPct: 0 };
}

export const PARTY_MAX = 5;
export const PARTY_MIN_PVE = 1;

export function validatePartySize(size, { max = PARTY_MAX } = {}) {
  if (size < 1) throw new Error('Party is empty.');
  if (size > max) throw new Error(`Parties hold at most ${max} incarnations (2–5 for synergy content).`);
}

// Extra synergy on top of formation: classic line of tank + healer + striker.
export function roleSynergy(members) {
  const roles = new Set(members.map((m) => m.role));
  let bonusPct = 0;
  const parts = [];
  if (roles.has('Frontliner') && roles.has('Support') && roles.has('Damage')) {
    bonusPct += 5;
    parts.push('Balanced Line +5%');
  }
  if (roles.has('Scout') && roles.has('Information')) {
    bonusPct += 3;
    parts.push('Recon Pair +3%');
  }
  if (roles.has('Leader') && members.length >= 3) {
    bonusPct += 2;
    parts.push('Led Company +2%');
  }
  return { bonusPct, parts };
}

export function partyBonusPct(members) {
  return formationBonus(members).bonusPct + roleSynergy(members).bonusPct;
}
