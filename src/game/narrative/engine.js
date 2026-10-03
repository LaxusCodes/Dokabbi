// Narrative engine: history -> stories (§53). Keep in game layer, not commands.
import { storyFromAchievement } from '../stories/system.js';
export function evaluateNarrative({ savedCount = 0, sacrificed = false, clearedImpossible = false }) {
  const earned = [];
  if (savedCount >= 5) earned.push(storyFromAchievement('merciful'));
  if (clearedImpossible) earned.push(storyFromAchievement('impossible'));
  if (sacrificed) earned.push({ id: 'selfless_choice', name: 'One Who Chose Others', grade: 'Legendary', power: 4 });
  return earned.filter(Boolean);
}
