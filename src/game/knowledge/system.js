// Knowledge: information as a multiplayer resource. Pure — persistence in world/store.js.
export const SHARE_SCOPES = ['private', 'party', 'player', 'nebula', 'public', 'global'];
export const SCOPE_LABELS = {
  private: 'Nobody',
  party: 'Party',
  player: 'Individual Player',
  nebula: 'Nebula',
  public: 'Public Star Stream',
  global: 'GLOBAL (every server)',
};

export function validateShareScope(scope) {
  if (!SHARE_SCOPES.includes(scope)) throw new Error(`Scope must be: ${SHARE_SCOPES.join(', ')}`);
  return scope;
}

// Asymmetric briefs: choices gated by knowledge are invisible to those who lack it.
export function visibleChoices(scenario, ownedIds = []) {
  const owned = new Set(ownedIds);
  return (scenario.choices || []).map((c) => ({
    choice: c,
    locked: Boolean(c.requiresKnowledge && !owned.has(c.requiresKnowledge)),
  }));
}

export function requireChoiceAccess(choice, ownedIds = []) {
  if (choice.requiresKnowledge && !ownedIds.includes(choice.requiresKnowledge)) {
    throw new Error('You lack the knowledge this action requires. (Observe the world — /observe.)');
  }
  return true;
}

export function hasForeknowledge(ownedIds = [], scenarioId) {
  return ownedIds.some((id) => id.startsWith('foreknow_'));
}

export function readerBrief() {
  return 'You recognize this place. You remember something dangerous happens here — options others cannot see may exist. Using foreknowledge will disturb Probability.';
}

// Asymmetric fragments: deterministic per player so the only way to hold the
// whole picture is to communicate (or ask Dokja).
export function fragmentFor(discordId, options) {
  const h = [...discordId].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return options[h % options.length];
}
