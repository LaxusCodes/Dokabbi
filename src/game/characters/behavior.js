// Behavior: what a character decides to do, from goals + opinions + state. Pure.
// NPCs never rewrite reality — decide() returns an action; actions.js applies it
// through the same world/event systems players use.
export function decide({ charId, goals = [], state = 'Unknown', attention = 0, memories = {}, eventKind = null, rng = Math.random } = {}) {
  const mem = (k) => parseInt(memories[k] || '0', 10) || 0;

  // Wariness ripens into investigation.
  if (state === 'Wary' && (eventKind === 'altered' || mem('alters_seen') > 0)) {
    return { type: 'investigate', detail: 'unusual knowledge' };
  }
  // Hostility warns first — once.
  if ((state === 'Hostile' || state === 'Enemy') && !mem('warned')) {
    return { type: 'warn', detail: 'final warning' };
  }
  // Active goals pull characters to new ground.
  const active = goals.find((g) => g.status === 'active');
  if (active && (active.progress || 0) > 0 && rng() < 0.35) {
    return { type: 'relocate', detail: active.goal };
  }
  // The talkative ones spread what they carry.
  if (charId === 'plaza_runner' && eventKind === 'clear' && rng() < 0.5) {
    return { type: 'rumor', detail: 'latest clear' };
  }
  // Watching is the default.
  if (attention >= 10 && rng() < 0.3) {
    return { type: 'observe', detail: 'quiet study' };
  }
  return { type: 'none', detail: '' };
}

// How an investigation resolves against a specific player.
export function investigatePlayer({ hides = 0, alters = 0, sharedPublic = 0 }) {
  if (alters >= 2) return { found: 'divergence', line: 'The divergences cluster around you. You are the anomaly.' };
  if (hides >= 2) return { found: 'secrecy', line: 'You hide things. I have counted the silences.' };
  if (sharedPublic >= 1) return { found: 'openness', line: 'You share what you learn. That is either brave or foolish.' };
  return { found: null, line: 'Nothing yet. But I am watching.' };
}
