// World memory: NPC trust, known events, disturbance broadcasts. Pure builders.
export function applyTrust(trust, delta) {
  return Math.max(-100, Math.min(100, (trust || 0) + delta));
}

export function trustBand(trust) {
  if (trust >= 60) return 'devoted';
  if (trust >= 20) return 'warm';
  if (trust > -20) return 'neutral';
  if (trust > -60) return 'wary';
  return 'hostile';
}

// The server-wide announcement when a predetermined event is changed.
export function disturbanceLines(playerName, scenarioTitle) {
  return [
    'Breaking News',
    `An incarnation (${playerName}) has changed a predetermined event in ${scenarioTitle}.`,
    'Probability is fluctuating.',
    'Several constellations are extremely interested.',
  ];
}

export function worldEventSummary(kind, actorName, detail) {
  const map = {
    scenario_clear: `${actorName} cleared ${detail}.`,
    scenario_altered: `${actorName} ALTERED ${detail} — the world remembers.`,
    knowledge_shared: `${actorName} shared information with the ${detail}.`,
    npc_changed: `${detail}`,
  };
  return map[kind] || `${actorName}: ${detail}`;
}
