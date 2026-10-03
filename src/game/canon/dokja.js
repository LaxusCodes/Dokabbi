// Kim Dokja as a world character: attention + relationship state machine.
// Pure — persistence in canon/store.js. All dialogue is original fan-written text.
export const REACTIONS = ['observe', 'ignore', 'investigate', 'intervene', 'test', 'assist', 'mislead', 'warn'];

// How much each server event raises (or lowers) Dokja's attention.
export function attentionDeltaFor(kind) {
  const map = { altered: 10, foreknow: 4, clear: 1, global_resolved: 8, ask: 2, hide: -3 };
  return map[kind] || 0;
}

export function relationshipLabel(trust, attention) {
  if ((trust || 0) >= 40) return 'Trusted';
  if ((trust || 0) >= 15) return 'Friendly';
  if ((trust || 0) <= -20) return 'Hostile';
  if ((attention || 0) >= 30) return 'Suspicious';
  if ((attention || 0) >= 15) return 'Wary';
  return 'Unaware';
}

// Dokja does not explain himself freely. Reaction depends on server history + this player.
export function chooseReaction({ attention = 0, trust = 0, alters = 0 } = {}) {
  if (trust <= -20) return 'mislead';
  if (trust >= 40) return 'assist';
  if (alters >= 1 && attention >= 20) return 'intervene';
  if (attention >= 30) return 'test';
  if (attention >= 15) return 'investigate';
  if (trust >= 15) return 'warn';
  if (attention >= 5) return 'observe';
  return 'ignore';
}

export function dokjaLine(reaction, playerName = 'you') {
  const lines = {
    observe: `"...That's not how it went before." Kim Dokja is watching ${playerName}.`,
    ignore: `Kim Dokja glances past ${playerName}, already rereading the situation.`,
    investigate: `"You knew something back there." Kim Dokja starts checking ${playerName}'s story against his own.`,
    intervene: `"Stop." Kim Dokja steps into ${playerName}'s path. "Whatever you're about to change — think about who pays for it."`,
    test: `"Let me ask you something, ${playerName}." His eyes narrow. "What waits east of the plaza — and how do you know?"`,
    assist: `Kim Dokja presses something into ${playerName}'s hand. "You'll need this more than I do. Don't make me regret it."`,
    mislead: `"East is safe," Kim Dokja says too quickly. "Probably. You should go first."`,
    warn: `"Careful, ${playerName}. The stream punishes people who know too much — and I can't always cover for you."`,
  };
  return lines[reaction] || lines.ignore;
}

export function dokjaGreeting(attention) {
  if (attention >= 30) return `📖 Kim Dokja tenses as you approach. "You again. The story keeps bending around you."`;
  if (attention >= 15) return `📖 Kim Dokja studies you. "...You know things you shouldn't."`;
  return `📖 Kim Dokja nods briefly, most of his attention on the scenario. "Stay alive. That's the whole trick."`;
}
