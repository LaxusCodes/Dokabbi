import { statusPressure, probabilityCost } from '../probability/system.js';

// ---- Phase 1: kept unchanged (tests depend on these) ----
export function computePower({ stats, attrBonus = 0, skillMult = 1, itemBonus = 0, storyBonus = 0, partyBonusPct = 0 }) {
  const base = stats.str * 2 + stats.agi * 1.5 + stats.mag * 1.8 + stats.intel * 1.2 + stats.vit;
  return Math.floor((base + attrBonus + itemBonus + storyBonus) * skillMult * (1 + partyBonusPct / 100));
}

export function resolveAttack({ attacker, defender, envMod = 0, rng = Math.random }) {
  const atk = computePower(attacker);
  const def = computePower(defender);
  const pressure = statusPressure(attacker.status ?? 50, defender.stats?.level ?? defender.level ?? 1);
  const variance = 0.85 + rng() * 0.3;
  const damage = Math.max(1, Math.floor((atk - def * 0.6 + envMod) * variance * pressure));
  const crit = rng() < 0.1 + (attacker.stats?.agi ?? 5) * 0.002;
  return { damage: crit ? damage * 2 : damage, crit, pressure: Math.round(pressure * 100) };
}

// ---- Phase 2: turn-based party engine (Discord-independent) ----
// Reused later by: Party PvE -> PvP -> Boss -> Card Battles -> Nebula Wars.

export const ROLES = ['Leader', 'Frontliner', 'Damage', 'Support', 'Controller', 'Scout', 'Information'];
export const ROLE_MODS = {
  Leader: { attackMult: 1.0, defenseMult: 1.0 },
  Frontliner: { attackMult: 0.9, defenseMult: 0.8 },
  Damage: { attackMult: 1.15, defenseMult: 1.05 },
  Support: { attackMult: 0.8, defenseMult: 1.0, heal: 12 },
  Controller: { attackMult: 0.9, defenseMult: 0.95, staggerChance: 0.2 },
  Scout: { attackMult: 1.05, defenseMult: 1.0, critBonus: 0.05 },
  Information: { attackMult: 0.85, defenseMult: 1.0, weakBonus: 0.15 },
};
export function validateRole(role) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role. Pick: ${ROLES.join(', ')}`);
  return role;
}

export const SKILL_COST = 15;
export const HEAL_COST = 10;

// combatant: { id, name, level, hp, maxHp, energy, maxEnergy, stats, status,
//   powerTier, role, team, probability, build:{attrBonus,skillMult,itemBonus,storyBonus,partyBonusPct}, effects:[] }
// effect: { type:'burn'|'guard'|'focus'|'stagger', turns, value }
export function createCombatant(o) {
  return {
    effects: [],
    role: 'Damage',
    team: 'A',
    status: 50,
    powerTier: o.level ?? 1,
    probability: 100,
    build: {},
    ...o,
    stats: { ...o.stats },
    effects: [...(o.effects || [])],
  };
}

export function isAlive(c) {
  return c.hp > 0;
}

export function applyEffect(c, effect) {
  const existing = c.effects.find((e) => e.type === effect.type);
  if (existing) {
    existing.turns = Math.max(existing.turns, effect.turns);
    existing.value = Math.max(existing.value, effect.value || 0);
  } else {
    c.effects.push({ value: 0, ...effect });
  }
}

// Tick start-of-turn effects. Returns log strings. Mutates combatant.
export function tickEffects(c) {
  const lines = [];
  for (const e of [...c.effects]) {
    if (e.type === 'burn') {
      c.hp = Math.max(0, c.hp - e.value);
      lines.push(`${c.name} burns for ${e.value}.`);
    }
    e.turns -= 1;
  }
  c.effects = c.effects.filter((e) => e.turns > 0);
  return lines;
}

function hasEffect(c, type) {
  return c.effects.some((e) => e.type === type);
}

// Target selection strategies: 'front' | 'lowest_hp' | 'highest_power' | 'random'
export function selectTarget(enemies, strategy = 'front', rng = Math.random) {
  const alive = enemies.filter(isAlive);
  if (!alive.length) return null;
  if (strategy === 'lowest_hp') return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
  if (strategy === 'highest_power') {
    return alive.reduce((a, b) => (computePower({ stats: b.stats, ...b.build }) > computePower({ stats: a.stats, ...a.build }) ? b : a));
  }
  if (strategy === 'random') return alive[Math.floor(rng() * alive.length)];
  // 'front': Frontliners protect the line — hit them first.
  return alive.find((e) => e.role === 'Frontliner') || alive[0];
}

function attackerParams(c) {
  return { stats: c.stats, status: c.status, ...c.build };
}

function strikeDamage(actor, target, mult, rng) {
  const role = ROLE_MODS[actor.role] || ROLE_MODS.Damage;
  const defRole = ROLE_MODS[target.role] || ROLE_MODS.Damage;
  const out = resolveAttack({ attacker: attackerParams(actor), defender: attackerParams(target), rng });
  let damage = out.damage * mult * role.attackMult * defRole.defenseMult;
  let crit = out.crit;
  if (!crit && role.critBonus && rng() < role.critBonus) {
    crit = true;
    damage *= 2;
  }
  if (role.weakBonus && target.effects.length) damage *= 1 + role.weakBonus;
  if (hasEffect(target, 'guard')) damage *= 0.5;
  if (hasEffect(actor, 'focus')) {
    damage *= 1.25;
    actor.effects = actor.effects.filter((e) => e.type !== 'focus');
  }
  damage = Math.max(1, Math.floor(damage));
  return { damage, crit };
}

// One combatant acts. Returns log entry objects. Mutates state.
export function takeTurn(actor, allies, enemies, { scenarioTier = 1, focus = 'front', rng = Math.random } = {}) {
  const entries = [];
  if (!isAlive(actor)) return entries;
  for (const line of tickEffects(actor)) entries.push({ type: 'effect', text: line });
  if (!isAlive(actor)) {
    entries.push({ type: 'down', actor: actor.name, text: `${actor.name} collapses.` });
    return entries;
  }
  if (hasEffect(actor, 'stagger')) {
    entries.push({ type: 'skip', actor: actor.name, text: `${actor.name} is staggered and cannot move.` });
    return entries;
  }
  const role = ROLE_MODS[actor.role] || ROLE_MODS.Damage;

  // Support heals the most-hurt ally.
  const hurt = allies.filter((a) => isAlive(a) && a.hp < a.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (role.heal && hurt && actor.energy >= HEAL_COST) {
    actor.energy -= HEAL_COST;
    const amount = Math.min(role.heal + Math.floor(actor.stats.mag / 2), hurt.maxHp - hurt.hp);
    hurt.hp += amount;
    entries.push({ type: 'heal', actor: actor.name, actorId: actor.id, target: hurt.name, targetId: hurt.id, amount, text: `${actor.name} restores ${amount} HP to ${hurt.name}.` });
    return entries;
  }

  const target = selectTarget(enemies, focus, rng);
  if (!target) return entries;

  // Skill strike when affordable (energy + probability).
  const cost = probabilityCost(actor.powerTier, scenarioTier);
  if (actor.energy >= SKILL_COST && actor.probability >= cost) {
    actor.energy -= SKILL_COST;
    actor.probability -= cost;
    const { damage, crit } = strikeDamage(actor, target, 1.5, rng);
    target.hp = Math.max(0, target.hp - damage);
    if (actor.role === 'Controller' && rng() < (role.staggerChance || 0) && isAlive(target)) {
      applyEffect(target, { type: 'stagger', turns: 2 });
    } else if (rng() < 0.25 && isAlive(target)) {
      applyEffect(target, { type: 'burn', turns: 2, value: 4 });
    }
    entries.push({
      type: 'skill', actor: actor.name, target: target.name, damage, crit,
      text: `${actor.name} unleashes a skill on ${target.name} for ${damage}${crit ? ' CRIT' : ''}.`,
    });
    if (!isAlive(target)) entries.push({ type: 'down', actor: target.name, text: `${target.name} falls.` });
    return entries;
  }

  // Basic attack; occasionally Guard or Focus instead.
  const roll = rng();
  if (roll < 0.1) {
    applyEffect(actor, { type: 'guard', turns: 2 });
    entries.push({ type: 'guard', actor: actor.name, actorId: actor.id, text: `${actor.name} takes a defensive stance.` });
    return entries;
  }
  if (roll < 0.18) {
    applyEffect(actor, { type: 'focus', turns: 2 });
    entries.push({ type: 'focus', actor: actor.name, text: `${actor.name} reads the flow (+25% next strike).` });
    return entries;
  }
  const { damage, crit } = strikeDamage(actor, target, 1.0, rng);
  target.hp = Math.max(0, target.hp - damage);
  entries.push({
    type: 'attack', actor: actor.name, target: target.name, damage, crit,
    text: `${actor.name} hits ${target.name} for ${damage}${crit ? ' CRIT' : ''}.`,
  });
  if (!isAlive(target)) entries.push({ type: 'down', actor: target.name, text: `${target.name} falls.` });
  return entries;
}

export function runBattle(sideA, sideB, { scenarioTier = 1, focusA = 'front', focusB = 'front', maxRounds = 20, rng = Math.random } = {}) {
  const log = [];
  let round = 0;
  while (sideA.some(isAlive) && sideB.some(isAlive) && round < maxRounds) {
    round += 1;
    const order = [...sideA, ...sideB].filter(isAlive).sort((a, b) => b.stats.agi - a.stats.agi);
    for (const actor of order) {
      const allies = actor.team === 'A' ? sideA : sideB;
      const enemies = actor.team === 'A' ? sideB : sideA;
      if (!enemies.some(isAlive)) break;
      const focus = actor.team === 'A' ? focusA : focusB;
      for (const e of takeTurn(actor, allies, enemies, { scenarioTier, focus, rng })) {
        log.push({ round, ...e });
      }
    }
  }
  const aAlive = sideA.some(isAlive);
  const bAlive = sideB.some(isAlive);
  const timeout = round >= maxRounds && aAlive && bAlive;
  let winner = null;
  if (aAlive && !bAlive) winner = 'A';
  else if (bAlive && !aAlive) winner = 'B';
  else {
    // Timeout: side with more total HP% wins.
    const pct = (side) => side.reduce((s, c) => s + c.hp / c.maxHp, 0);
    winner = pct(sideA) >= pct(sideB) ? 'A' : 'B';
  }
  return { winner, rounds: round, log, timeout };
}

// Rewards split across the winning side. Anti-farming: big level gaps pay little.
export function combatRewards({ victory, monsterPower = 10, partySize = 1, levelGap = 0, titlePct = 0 }) {
  if (!victory) return { coins: 5, xp: 5 };
  const gapMult = levelGap > 10 ? 0.2 : 1;
  const coinsEach = Math.max(1, Math.floor(((monsterPower * 12) / Math.max(1, partySize)) * gapMult * (1 + titlePct / 100)));
  const xpEach = Math.max(1, Math.floor(monsterPower * 6 * gapMult));
  return { coins: coinsEach, xp: xpEach };
}

// ---- Hooks for future engines (Cards §26, Nebula Wars §32) ----
export function cardToCombatant(card, { team = 'A' } = {}) {
  return createCombatant({
    id: card.id, name: card.name, level: card.cost || 1,
    hp: 30 + (card.power || 0) * 2, maxHp: 30 + (card.power || 0) * 2,
    energy: 20, maxEnergy: 20,
    stats: { str: card.power || 1, agi: card.power || 1, vit: 5, mag: card.power || 1, intel: 3 },
    role: 'Damage', team,
    build: { attrBonus: (card.tags || []).length },
  });
}

export function nebulaToSide(members, { team = 'A' } = {}) {
  return members.map((m) =>
    createCombatant({
      id: m.discord_id || m.id, name: m.name, level: m.level || 1,
      hp: m.max_hp || 100, maxHp: m.max_hp || 100, energy: m.max_energy || 50, maxEnergy: m.max_energy || 50,
      stats: { str: m.str || 5, agi: m.agi || 5, vit: m.vit || 5, mag: m.mag || 5, intel: m.intel || 5 },
      role: m.role || 'Damage', team,
    })
  );
}
