// Personalized daily missions: generated from a life, checked against today. Pure.
export const MISSION_REWARD = { coins: 150, xp: 20 };
export const ALL_CLEAR_BONUS = { coins: 300, favor: 5, energy: 10 };

// life: {inParty, sponsored, scenarioProgress} — the fourth mission adapts.
export function generateMissions(life = {}) {
  const ally = life.inParty
    ? { id: 'ally', text: 'Stand beside your party — the Stream grades how you fight when alone is how you fight when it matters', hint: 'any combat counts' }
    : life.sponsored
      ? { id: 'ally', text: 'Honor your sponsor — their favor is a ledger, not a gift', hint: 'clear a scenario' }
      : { id: 'ally', text: 'Observe the world and find what it hides from everyone else', hint: '/observe or learn' };
  return [
    { id: 'clear', text: 'Make a choice that changes something — scenarios are where the Stream writes its next chapter', hint: 'decide something' },
    { id: 'combat', text: 'Survive a fight — every battle is a story the constellations will read later', hint: '/pve, /pvp, /duel, clash' },
    ally,
    { id: 'stream', text: 'Move the world — vote, wager, or share what you know; the Stream only advances when someone acts', hint: 'vote, wager, or share' },
  ];
}

// signals: {scenarios, combats, ally, stream} — counts from today.
const SIGNAL_OF = { clear: 'scenarios', combat: 'combats', ally: 'ally', stream: 'stream' };
export function missionDone(id, signals = {}) {
  return (signals[SIGNAL_OF[id] || id] || 0) > 0;
}

export function missionsStatus(missions, signals) {
  return missions.map((m) => ({ ...m, done: missionDone(m.id, signals) }));
}

// Streaks forgive a single missed day; two in a row resets. Pure.
export function advanceStreak({ streak = 0, lastDay = null }, today) {
  if (lastDay === today) return { streak, claimed: true };
  const d = (s) => new Date(s + 'T00:00:00Z').getTime();
  if (lastDay && d(today) - d(lastDay) === 86400000) return { streak: streak + 1, claimed: false };
  if (lastDay && d(today) - d(lastDay) === 2 * 86400000) return { streak, claimed: false }; // grace
  return { streak: 1, claimed: false };
}

export function streakDay(streak) {
  return ((streak - 1) % 7) + 1;
}

// Day rewards cycle weekly; the streak itself keeps climbing.
export function streakReward(day) {
  const table = {
    1: { coins: 100, text: '+100 coins' },
    2: { energy: 20, text: '+20 energy' },
    3: { encounter: true, text: 'a free encounter' },
    4: { coins: 200, charges: 1, text: '+200 coins, +1 stigma charge' },
    5: { favor: 5, text: '+5 favor with your watcher' },
    6: { coins: 300, text: '+300 coins' },
    7: { coins: 300, knowledge: true, text: '+300 coins + a secret' },
  };
  return table[day] || table[1];
}
