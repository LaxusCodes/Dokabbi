// Battlefield conditions: faction conflict + revealed knowledge change the math. Pure.
import { memberOf } from '../nebulas/store.js';
import { relationState } from '../nebulas/store.js';
import { allNebulaDefs } from '../nebulas/store.js';

// Hostile factions bend the scenario itself.
export function factionModifier(guildId, discordId) {
  const m = memberOf(discordId, guildId);
  const rivalStates = allNebulaDefs()
    .filter((n) => (m ? n.id !== m.nebula_id : true))
    .map((n) => (m ? relationState(guildId, m.nebula_id, n.id) : 'Neutral'));
  const atConflict = rivalStates.some((s) => s === 'Hostile' || s === 'At War');
  if (!m) {
    return atConflict
      ? { combatPct: 0, rewardPct: 5, line: 'Unaffiliated: the stream favors the unaligned (+5% rewards).' }
      : { combatPct: 0, rewardPct: 0, line: null };
  }
  const alignment = m.nebula.def?.alignment;
  if (!atConflict) return { combatPct: 0, rewardPct: 0, line: null };
  if (alignment === 'guardians') {
    return { combatPct: 10, rewardPct: 0, line: `⚔️ FACTION CONFLICT — ${m.nebula.name} shields its own (+10% combat).` };
  }
  return { combatPct: 0, rewardPct: 10, line: `⚔️ FACTION CONFLICT — ${m.nebula.name} rewards the bold (+10% scenario rewards).` };
}

export function revealBonus(knowledgeId, monster) {
  if (monster?.weakness_knowledge && monster.weakness_knowledge === knowledgeId) {
    return { pct: 25, line: `🔥 Weakness discovered! ${monster.name}: ${monster.weakness}` };
  }
  return { pct: 10, line: 'Shared insight steadies the party (+10%).' };
}
