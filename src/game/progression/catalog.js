// Attribute / skill / item catalogs load from data/*.json (data-driven per roadmap §51).
import attributes from '../../../data/attributes.json' with { type: 'json' };
import skills from '../../../data/skills.json' with { type: 'json' };
import items from '../../../data/items.json' with { type: 'json' };

export const listAttributes = () => attributes;
export const listSkills = () => skills;
export const listItems = () => items;
export function comboBonus(attrIds = [], skillIds = []) {
  // Example build synergy: reader + insight skill.
  if (attrIds.includes('novice_reader') && skillIds.includes('insight')) return 8;
  return 0;
}
