import { createCombatant, computePower, applyEffect } from './engine.js';
import { powerOf } from '../cards/characters.js';

// Companions use the SAME combat contract as everyone else: power, role, tags.
// No second engine — this module only translates catalog entries and fires
// one signature-skill opening before the existing engine takes over.
const ROLE_MAP = {
  Fighter: 'Damage', Crusader: 'Damage', Slayer: 'Damage', Warmonger: 'Damage', Duelist: 'Damage',
  Brawler: 'Damage', Gambler: 'Damage', 'Sword Saint': 'Damage', Plotter: 'Damage', Sage: 'Damage',
  Calamity: 'Damage', Tempest: 'Damage', Tempter: 'Damage', Reveler: 'Damage', Pit: 'Damage',
  Antagonist: 'Damage', Mirror: 'Damage', Reincarnator: 'Damage',
  Guardian: 'Frontliner', Shield: 'Frontliner', Warden: 'Frontliner', Monarch: 'Frontliner',
  Queen: 'Frontliner', Admiral: 'Frontliner', Soldier: 'Frontliner', Guard: 'Frontliner',
  Healer: 'Support', Medic: 'Support', Support: 'Support', Volunteer: 'Support', Beastmaster: 'Support',
  Scout: 'Scout', Runner: 'Scout', Messenger: 'Scout', Gunner: 'Scout',
  Reader: 'Information', Writer: 'Information', Interpreter: 'Information', Oracle: 'Information',
  Archivist: 'Information', Strategist: 'Information', Seeker: 'Information', Herald: 'Information',
  Teacher: 'Support', Prosecutor: 'Controller', Judge: 'Controller', Artificer: 'Controller',
  Agent: 'Controller', Scribe: 'Information', Commander: 'Leader', Leader: 'Leader',
  Seraph: 'Damage', Radiance: 'Damage', Landlord: 'Frontliner', Survivor: 'Damage',
  Sailor: 'Damage', Elder: 'Support', Dokkaebi: 'Controller', Scavenger: 'Scout',
};

export function combatRoleFor(def) {
  if (ROLE_MAP[def.role]) return ROLE_MAP[def.role];
  const tags = def.tags || [];
  if (tags.includes('healer') || tags.includes('support')) return 'Support';
  if (tags.includes('shield') || tags.includes('guardian')) return 'Frontliner';
  if (tags.includes('scout')) return 'Scout';
  if (tags.includes('insight')) return 'Information';
  if (tags.includes('control')) return 'Controller';
  return 'Damage';
}

export function companionCombatant(def, team = 'A', opts = {}) {
  const power = powerOf(def);
  const synergy = opts.synergy || 0;
  const bond = opts.bondLevel || 0;
  return createCombatant({
    id: `companion:${def.id}`,
    name: def.name,
    level: 3 + Math.floor(power / 8),
    hp: 40 + power * 3,
    maxHp: 40 + power * 3,
    energy: 30,
    maxEnergy: 30,
    stats: { str: 4 + power, agi: 4 + Math.floor(power / 2), vit: 6 + Math.floor(power / 2), mag: 4 + Math.floor(power / 2), intel: 5, level: 3 },
    status: 60,
    powerTier: 2,
    role: combatRoleFor(def),
    team,
    build: { storyBonus: Math.floor(power / 2) + synergy + bond * 2 },
  });
}

// Progression, separate from rank: mastery (wins), bond (shared events),
// trust (relationship). A lived-in S outgrows a fresh SSS.
export function evolutionStage(mastery) {
  if ((mastery || 0) >= 10) return 2;
  if ((mastery || 0) >= 3) return 1;
  return 0;
}

export function bondLevel(bond) {
  return Math.max(0, Math.min(5, Math.floor((bond || 0) / 20)));
}

// Trust gates evolution: a stranger's full strength stays locked.
export function effectiveStage(mastery, trust) {
  const stage = evolutionStage(mastery);
  if ((trust || 0) >= 50) return stage;
  if ((trust || 0) >= 25) return Math.min(stage, 1);
  return 0;
}

// Companions talk: bond-gated voices, not flavor text. Pure.
const VOICES = {
  assault: { low: 'Hmph. Point me at something.', high: 'Stick close. I will break whatever comes.' },
  ward: { low: 'I will hold. Probably.', high: 'Nothing touches you while I stand.' },
  insight: { low: '...interesting currents today.', high: 'I have read this outcome. Trust me.' },
  vitality: { low: 'Rest if you must. I will keep watch.', high: 'Breathe. I have carried worse than this.' },
  fortune: { low: 'Everything has a price, friend.', high: 'Leave the odds to me. I know their debts.' },
};

export function companionTalk(def, { bond = 0, trust = 10 } = {}) {
  const voice = VOICES[schoolFor(def)] || VOICES.assault;
  if (trust < 25) return `${def.name} keeps a professional distance. ("${voice.low}")`;
  if (bond >= 40) return `${def.name} clasps your shoulder. ("${voice.high}")`;
  return `${def.name} nods to you. ("${voice.low}")`;
}
export function synergyBonus(def, playerTags = []) {
  const mine = new Set(playerTags);
  let shared = 0;
  for (const t of def.tags || []) if (mine.has(t)) shared += 1;
  return Math.min(8, shared * 2);
}

// Signature-skill schools: assault, ward, insight, vitality, fortune.
// SSS is not auto-best: a ward saves parties an assault cannot.
export function schoolFor(def) {
  const tags = new Set(def.tags || []);
  if (tags.has('healer') || tags.has('support') || def.role === 'Healer' || def.role === 'Medic') return 'vitality';
  if (tags.has('shield') || tags.has('guardian') || tags.has('fortress')) return 'ward';
  if (tags.has('insight') || tags.has('scout') || tags.has('oracle') || tags.has('mirror')) return 'insight';
  if (tags.has('coins') || tags.has('gambit') || tags.has('schemer')) return 'fortune';
  const role = combatRoleFor(def);
  if (role === 'Support') return 'vitality';
  if (role === 'Frontliner') return 'ward';
  if (role === 'Scout' || role === 'Information' || role === 'Controller') return 'insight';
  return 'assault';
}

// One opening action, logged at round 0, then the engine takes over.
// Stage (mastery + trust) evolves the signature: bigger, longer, richer.
export function companionOpening(companion, allies, foes, def, rng = Math.random, stage = 0) {
  const school = schoolFor(def);
  const power = powerOf(def);
  const entries = [];
  if (!foes.some((f) => f.hp > 0)) return { entries, rewardPct: 0 };
  if (school === 'assault') {
    const target = foes.filter((f) => f.hp > 0).sort((a, b) => b.hp - a.hp)[0];
    const atk = computePower({ stats: companion.stats, ...companion.build });
    const damage = Math.max(1, Math.floor(atk * (0.8 + rng() * 0.4 + stage * 0.2)));
    target.hp = Math.max(0, target.hp - damage);
    entries.push({ round: 0, type: 'skill', actor: companion.name, actorId: companion.id, target: target.name, damage, text: `${companion.name} opens with ${def.skill.name} for ${damage}.` });
    return { entries, rewardPct: 0 };
  }
  if (school === 'ward') {
    for (const a of allies) applyEffect(a, { type: 'guard', turns: 2 + Math.min(stage, 2) });
    entries.push({ round: 0, type: 'guard', actor: companion.name, actorId: companion.id, text: `${companion.name} raises ${def.skill.name}: the party is guarded.` });
    return { entries, rewardPct: 0 };
  }
  if (school === 'insight') {
    applyEffect(companion, { type: 'focus', turns: 3 + stage });
    entries.push({ round: 0, type: 'focus', actor: companion.name, actorId: companion.id, text: `${companion.name} reads the flow with ${def.skill.name} (+25% next strike).` });
    return { entries, rewardPct: 0 };
  }
  if (school === 'vitality') {
    for (const a of allies) a.energy = Math.min(a.maxEnergy, a.energy + 10 + stage * 5);
    entries.push({ round: 0, type: 'heal', actor: companion.name, actorId: companion.id, text: `${companion.name} steadies the party with ${def.skill.name} (+${10 + stage * 5} energy).` });
    return { entries, rewardPct: 0 };
  }
  const pct = 10 + stage * 5;
  entries.push({ round: 0, type: 'focus', actor: companion.name, actorId: companion.id, text: `${companion.name} schemes with ${def.skill.name}: spoils +${pct}%.` });
  return { entries, rewardPct: pct };
}
