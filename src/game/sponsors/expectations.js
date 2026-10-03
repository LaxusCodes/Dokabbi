// Expectations: what sponsors demand, read from the player's real history. Pure.
// signals: {clears, protect, defy, pve, wagerWins, stories[]} gathered in contracts.js
export const EXPECTATION_TYPES = {
  protect: { label: 'Protect another incarnation', hint: 'Shield or warn others inside scenarios.' },
  clear: { label: 'Complete scenarios', hint: 'Survive what the stream sends.' },
  defy: { label: 'Defy a predetermined outcome', hint: 'Change what was supposed to happen.' },
  stand_together: { label: 'Fight beside a party', hint: 'Face scenario combat with allies.' },
  profit: { label: 'Win a wager for your backer', hint: 'Make their investment pay.' },
  story: { label: 'Obtain Stories', hint: 'Live something worth remembering.' },
};

export function describeExpectation(type, required) {
  const t = EXPECTATION_TYPES[type] || { label: type };
  return `${t.label} (${required}x)`;
}

// Progress is always derived from history — never stored blindly.
export function evaluateExpectation(type, signals, required) {
  const s = signals || {};
  switch (type) {
    case 'protect': return Math.min(required, (s.protect || 0));
    case 'clear': return Math.min(required, (s.clears || 0));
    case 'defy': return Math.min(required, (s.defy || 0));
    case 'stand_together': return Math.min(required, (s.pve || 0));
    case 'profit': return Math.min(required, (s.wagerWins || 0));
    case 'story': return Math.min(required, (s.stories || []).length);
    default: return 0;
  }
}
