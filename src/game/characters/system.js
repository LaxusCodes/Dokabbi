// Character system: opinions, goals, states. Pure foundations.
export const REL_STATES = ['Unknown', 'Aware', 'Wary', 'Interested', 'Friendly', 'Trusted', 'Devoted', 'Hostile', 'Enemy'];

// Axes: trust (from npc_trust), fear, respect, interest, hostility (from character_relationships).
export function deriveState({ trust = 0, fear = 0, respect = 0, interest = 0, hostility = 0 } = {}) {
  if (hostility >= 60) return 'Enemy';
  if (hostility >= 30) return 'Hostile';
  if (trust >= 60) return 'Devoted';
  if (trust >= 30) return 'Trusted';
  if (trust >= 12 || respect >= 40) return 'Friendly';
  if (interest >= 30) return 'Interested';
  if (fear >= 30 || hostility >= 10) return 'Wary';
  if (trust + respect + interest + fear + hostility > 0) return 'Aware';
  return 'Unknown';
}

export const GOALS = {
  investigate_anomaly: { label: 'Investigate the anomaly', signal: 'alters' },
  understand_divergence: { label: 'Understand the divergence', signal: 'alters' },
  recruit_informant: { label: 'Recruit an informant', signal: 'public_shares' },
  survive: { label: 'Survive', signal: 'clears' },
  remember_debts: { label: 'Remember debts', signal: 'trust_events' },
  carry_news: { label: 'Carry news', signal: 'world_events' },
  protect_someone: { label: 'Protect someone', signal: 'protects' },
};

export const CHARACTER_DEFS = {
  kim_dokja: { name: 'Kim Dokja', goals: ['understand_divergence', 'recruit_informant', 'investigate_anomaly'] },
  survivor_17: { name: 'Survivor No. 17', goals: ['survive', 'remember_debts'] },
  plaza_runner: { name: 'Plaza Runner', goals: ['carry_news', 'survive'] },
};

export const ACTION_KINDS = ['relocate', 'investigate', 'warn', 'rumor', 'observe'];
