// Path requirements evaluated against world + player context. Pure.
// ctx: {knowledgeIds[], stories[], partySize, nebulaId, reputation, flags{}}
import { rankFor, rankIndex } from '../nebulas/system.js';

export function meetsRequires(requires = {}, ctx = {}) {
  const flags = ctx.flags || {};
  if (requires.minParty && (ctx.partySize || 1) < requires.minParty) return false;
  if (requires.nebula && ctx.nebulaId !== requires.nebula) return false;
  if (requires.minRank && rankIndex(rankFor(ctx.reputation || 0)) > rankIndex(requires.minRank)) return false;
  if (requires.knowledge && !(ctx.knowledgeIds || []).includes(requires.knowledge)) return false;
  if (requires.knowledgeAny && !(requires.knowledgeAny.some((k) => (ctx.knowledgeIds || []).includes(k)))) return false;
  if (requires.story && !(ctx.stories || []).includes(requires.story)) return false;
  if (requires.flag && flags[requires.flag.key] !== requires.flag.value) return false;
  if (requires.relationship && !meetsRelationship(requires.relationship, ctx)) return false;
  return true;
}

const REL_LADDER = ['Unknown', 'Aware', 'Wary', 'Interested', 'Friendly', 'Trusted', 'Devoted', 'Hostile', 'Enemy'];

export function meetsRelationship(req, ctx) {
  const state = (ctx.relationships || {})[req.char] || 'Unknown';
  if (req.min) {
    const order = ['Unknown', 'Aware', 'Wary', 'Interested', 'Friendly', 'Trusted', 'Devoted'];
    return order.indexOf(state) >= order.indexOf(req.min);
  }
  if (req.not) return state !== req.not;
  return true;
}

export function filterPaths(paths, ctx) {
  return (paths || []).map((p) => ({ path: p, locked: !meetsRequires(p.requires, ctx) }));
}

// Snapshot-level `when` clauses for titles and brief lines. Pure.
const LADDER = ['Neutral', 'Interested', 'Cooperative', 'Competitive', 'Hostile', 'At War'];

export function matchWhen(when = {}, snapshot = {}) {
  if (when.flag && (snapshot.flags || {})[when.flag.key] !== when.flag.value) return false;
  if (when.minAlters && (snapshot.alters || 0) < when.minAlters) return false;
  if (when.minBonds && (snapshot.bonds || 0) < when.minBonds) return false;
  if (when.minAttention && (snapshot.dokjaAttention || 0) < when.minAttention) return false;
  if (when.minSponsors && (snapshot.sponsors || 0) < when.minSponsors) return false;
  if (when.minWagers && (snapshot.wagers || 0) < when.minWagers) return false;
  if (when.minAgendas && (snapshot.agendas || 0) < when.minAgendas) return false;
  if (when.minDisturbance && (snapshot.disturbance || 0) < when.minDisturbance) return false;
  if (when.minDivergence && (snapshot.divergence || 0) < when.minDivergence) return false;
  if (when.relation) {
    const key = [when.relation.a, when.relation.b].sort().join('|');
    const state = snapshot.relations?.[key] || snapshot.relations?.[[when.relation.a, when.relation.b].join('|')] || 'Neutral';
    if (LADDER.indexOf(state) < LADDER.indexOf(when.relation.min)) return false;
  }
  return true;
}
