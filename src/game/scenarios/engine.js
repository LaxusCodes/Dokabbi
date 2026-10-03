// Data-driven scenario engine. Scenarios live in data/scenarios.json.
import scenarios from '../../../data/scenarios.json' with { type: 'json' };

export function getScenario(id) {
  return scenarios.find((s) => s.id === id);
}
export function nextScenario(progress) {
  return scenarios.find((s) => s.order === progress + 1) || null;
}
// Choice -> outcome: rewards, stories, favor deltas, flags. Deterministic + small rng.
export function resolveChoice(scenario, choiceId, rng = Math.random) {
  const choice = scenario.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error('Invalid choice');
  const success = rng() < (choice.successRate ?? 0.7);
  const branch = success ? choice.success : choice.fail;
  return { success, ...branch };
}
