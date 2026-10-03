// Story generation / fusion. Player history -> mechanical build.
export const STORY_GRADES = ['Historical', 'Legendary', 'Myth', 'Unique'];

export function storyFromAchievement(kind) {
  const map = {
    first_scenario: { id: 'survivor_first', name: 'Survivor of the First Scenario', grade: 'Historical', power: 3 },
    merciful: { id: 'merciful_survivor', name: 'Merciful Survivor', grade: 'Historical', power: 2 },
    impossible: { id: 'breaker_impossible', name: 'Breaker of the Impossible', grade: 'Legendary', power: 5 },
    refused_nebula: { id: 'refused_nebula', name: 'The Incarnation Who Refused a Nebula', grade: 'Historical', power: 3 },
    nebula_asset: { id: 'nebula_asset', name: 'Faction Asset of the Stream', grade: 'Legendary', power: 5 },
    defied_probability: { id: 'defied_probability', name: 'The Incarnation Who Defied Probability', grade: 'Myth', power: 7 },
    survived_together: { id: 'survived_together', name: 'The Two Who Survived Together', grade: 'Historical', power: 3 },
    fallen_legend: { id: 'fallen_legend', name: 'The One Who Fell Daring', grade: 'Legendary', power: 4 },
  };
  return map[kind];
}

export function fuseStories(a, b) {
  if (!a || !b) return null;
  return {
    id: `${a.id}+${b.id}`,
    name: 'Legend That Refused to Die',
    grade: 'Myth',
    power: a.power + b.power + 2,
  };
}
