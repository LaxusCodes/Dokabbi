import { getDb } from '../../database/db.js';
import { allFlags } from '../world/store.js';
import canonScenarios from '../../../data/canon/scenarios.json' with { type: 'json' };
import canonCharacters from '../../../data/canon/characters.json' with { type: 'json' };
import milestones from '../../../data/canon/milestones.json' with { type: 'json' };

// Canon is the expected path; history is what happened. Pure comparison.
export function detectDivergence({ trust = {}, flags = {}, alters = 0, choices = {}, brokerSponsored = false, underdogs = 0 } = {}) {
  const broken = [];
  const intact = [];
  for (const sc of canonScenarios) {
    for (const check of sc.checks || []) {
      let hit = false;
      if (check.kind === 'trust') hit = (trust[check.npc] || 0) > (check.above ?? 0);
      else if (check.kind === 'flag') hit = (flags[check.key] === check.value);
      else if (check.kind === 'choice') hit = (choices[check.choice] || 0) > 0;
      if (hit) broken.push({ scenario: sc.id, points: check.points, canon: check.canon, actual: check.actual });
      else intact.push({ scenario: sc.id, canon: check.canon });
    }
  }
  if ((flags['area.east'] === 'entered')) {
    broken.push({ scenario: 'CH3', points: 10, canon: 'The eastern route stays sealed', actual: 'Someone walked the sealed route' });
  } else {
    intact.push({ scenario: 'CH3', canon: 'The eastern route stays sealed' });
  }
  if (brokerSponsored) broken.push({ scenario: 'sponsor', points: 8, canon: 'No debts are owed to the Ledger', actual: 'The Broker holds an incarnation' });
  if (underdogs > 0) broken.push({ scenario: 'stream', points: 6 * underdogs, canon: 'Favorites prevail', actual: `${underdogs} upset(s) rewrote expectations` });
  if (alters > 0) broken.push({ scenario: 'timeline', points: 8 * alters, canon: 'Predetermined events stand', actual: `${alters} predetermined event(s) altered` });
  else intact.push({ scenario: 'timeline', canon: 'Predetermined events stand' });
  const score = broken.reduce((s, b) => s + b.points, 0);
  const total = score + intact.length * 5;
  return { score, band: divergenceBand(score), broken, intact, canonMemory: total ? Math.round(((total - score) / total) * 100) : 100 };
}

export function divergenceBand(score) {
  if (score >= 70) return 'rupture';
  if (score >= 40) return 'anomaly';
  if (score >= 20) return 'noticed';
  if (score >= 1) return 'stirrings';
  return 'dormant';
}

// Pressure influences probability; it never dictates outcomes.
export function pressureFor(band) {
  const map = {
    dormant: { note: 'The canon holds. The world breathes normally.', dokjaDelta: 0, brief: false },
    stirrings: { note: 'Strange coincidences multiply.', dokjaDelta: 2, brief: false },
    noticed: { note: 'Probability disturbances increase. The stars lean in.', dokjaDelta: 4, brief: true },
    anomaly: { note: 'Constellations notice. Dokja grows suspicious. Unusual branches open.', dokjaDelta: 8, brief: true },
    rupture: { note: 'ORIGINAL TIMELINE EVENT — this server no longer fits the canon.', dokjaDelta: 12, brief: true },
  };
  return map[band];
}

// Milestone comparison: expected vs actual, per milestone.
export function milestoneStatus(milestonesList, { flags = {}, eventKinds = [], alters = 0 } = {}) {
  return milestonesList.map((m) => {
    const c = m.check;
    let held = true;
    if (c.kind === 'flag') held = flags[c.key] !== c.absentValue;
    else if (c.kind === 'event') held = eventKinds.includes(c.eventKind);
    else if (c.kind === 'alters') held = alters <= (c.max ?? 0);
    return { id: m.id, canon: m.canon, held };
  });
}

// Guild-level computation from stored history.
export function computeDivergence(guildId) {
  const db = getDb();
  const flags = allFlags(guildId);
  const trustRows = db.prepare('SELECT npc_id, SUM(trust) t FROM npc_trust WHERE guild_id = ? GROUP BY npc_id').all(guildId);
  const trust = Object.fromEntries(trustRows.map((r) => [r.npc_id, r.t > 0 ? r.t : 0]));
  const choiceRows = db.prepare(`SELECT choice, COUNT(*) n FROM scenario_log WHERE choice IN ('forewarn') GROUP BY choice`).all();
  const alters = db.prepare('SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1').get(guildId).v;
  const brokerSponsored = db.prepare(`SELECT COUNT(*) v FROM sponsorships WHERE guild_id = ? AND constellation_id = 'whispering_broker'`).get(guildId).v > 0;
  const underdogs = db.prepare(`SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND summary LIKE '%NEW SERVER STORY — [The Choice Nobody Expected]%'`).get(guildId).v;
  return detectDivergence({
    trust, flags, alters,
    choices: Object.fromEntries(choiceRows.map((r) => [r.choice, r.n])),
    brokerSponsored, underdogs,
  });
}

export function anomalyServers(limit = 10) {
  const db = getDb();
  const guilds = db.prepare('SELECT DISTINCT guild_id FROM world_events').all().map((r) => r.guild_id);
  return guilds
    .map((g) => ({ guildId: g, ...computeDivergence(g) }))
    .filter((r) => r.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export { milestones, canonCharacters };
