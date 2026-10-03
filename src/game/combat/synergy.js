// Party synergy + bonds: cooperation becomes build, bonds become Stories. Pure.
export const BOND_SAVES_REQUIRED = 3;
export const BOND_BONUS_PCT = 3;

export function pairKey(a, b) {
  return [a, b].sort();
}

// Each honored pair fighting together: +3% per bond.
export function bondBonusPct(memberIds, honoredPairs) {
  let bonus = 0;
  const set = new Set((honoredPairs || []).map((p) => [...p].sort().join('|')));
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      if (set.has([memberIds[i], memberIds[j]].sort().join('|'))) bonus += BOND_BONUS_PCT;
    }
  }
  return bonus;
}

// From a battle log: who saved whom (heal entries where the target survived).
export function savesFromLog(log, survivors) {
  const alive = new Set(survivors);
  const saves = [];
  for (const e of log) {
    if (e.type === 'heal' && e.actorId && e.targetId && e.actorId !== e.targetId && alive.has(e.targetId)) {
      saves.push(pairKey(e.actorId, e.targetId));
    }
  }
  return saves;
}
