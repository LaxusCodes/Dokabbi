// Stigma progression: use -> proficiency -> hidden evolution. Pure.
import stigmas from '../../../data/stigmas.json' with { type: 'json' };

export const listStigmas = () => stigmas;
export const stigmaDef = (id) => stigmas.find((s) => s.id === id);

export function nextEvolution(stigmaId, level) {
  const def = stigmaDef(stigmaId);
  if (!def) return null;
  return (def.evolutions || []).find((e) => e.level === level + 1) || null;
}

// Evolution requirements stay hidden until the bearer is halfway there.
export function evolutionHint(stigmaId, level, mastery) {
  const evo = nextEvolution(stigmaId, level);
  if (!evo) return 'Fully evolved. The star is silent — satisfied.';
  const seen = (mastery?.uses || 0) >= Math.ceil(evo.uses / 2);
  if (!seen) return '??? (use the stigma and the star will speak)';
  return `${evo.hint} (${mastery?.uses || 0}/${evo.uses} uses, ${mastery?.protects || 0}/${evo.protects} shields)`;
}

export function checkEvolution(stigmaId, level, mastery) {
  const evo = nextEvolution(stigmaId, level);
  if (!evo) return null;
  if ((mastery?.uses || 0) >= evo.uses && (mastery?.protects || 0) >= evo.protects) return evo.level;
  return null;
}

export const UNLEASH_MULT = 2.0;
