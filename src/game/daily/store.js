import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { getPlayerParty } from '../parties/store.js';
import { memberOf } from '../nebulas/store.js';
import { activeContract } from '../sponsors/contracts.js';
import { addFavor, constellationFavor } from '../sponsors/contracts.js';
import { adjustTrust, recordEvent, grantKnowledge, playerKnowledgeIds } from '../world/store.js';
import { addAttention } from '../canon/store.js';
import { computeDivergence } from '../canon/divergence.js';
import { generateMissions, missionsStatus, advanceStreak, streakDay, streakReward, MISSION_REWARD, ALL_CLEAR_BONUS } from './missions.js';
import { buildWeights, pickEncounter, ENCOUNTER_COST } from './encounters.js';
import { applyXp } from '../progression/levels.js';
import knowledge from '../../../data/knowledge.json' with { type: 'json' };

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// Today's life signals — what the player actually did.
export function signalsFor(discordId) {
  const db = getDb();
  const today = dayKey();
  const scenarios = db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND date(created_at) = date('now')`).get(discordId).v
    + db.prepare(`SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ? AND date(created_at) = date('now')`).get(discordId).v;
  const combats = db.prepare(`SELECT COUNT(*) v FROM combat_logs WHERE participants LIKE '%' || ? || '%' AND date(created_at) = date('now')`).get(discordId).v;
  const helps = db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice IN ('help','forewarn') AND date(created_at) = date('now')`).get(discordId).v;
  const inParty = Boolean(getPlayerParty(discordId));
  const ally = inParty ? combats : helps + db.prepare(`SELECT COUNT(*) v FROM player_knowledge WHERE discord_id = ? AND date(created_at) = date('now')`).get(discordId).v;
  const stream = db.prepare(`SELECT COUNT(*) v FROM global_votes WHERE discord_id = ? AND date(created_at) = date('now')`).get(discordId).v
    + db.prepare(`SELECT COUNT(*) v FROM wagers WHERE kind='player' AND backer_id = ? AND date(created_at) = date('now')`).get(discordId).v
    + db.prepare(`SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND date(created_at) = date('now')`).get(discordId).v;
  void today;
  return { scenarios, combats, ally, stream };
}

export function lifeOf(player) {
  return {
    inParty: Boolean(getPlayerParty(player.discord_id)),
    sponsored: Boolean(activeContract(player.discord_id)),
    scenarioProgress: player.scenario_progress,
  };
}

export function dailyView(discordId) {
  const db = getDb();
  const p = getPlayer(discordId);
  const today = dayKey();
  let row = db.prepare('SELECT * FROM daily_state WHERE discord_id = ?').get(discordId);
  if (!row || row.day !== today) {
    const missions = generateMissions(lifeOf(p));
    db.prepare('INSERT INTO daily_state (discord_id, day, missions, claimed, checkin) VALUES (?,?,?,?,0) ON CONFLICT(discord_id) DO UPDATE SET day=?, missions=?, claimed=?, checkin=0')
      .run(discordId, today, JSON.stringify(missions), '[]', today, JSON.stringify(missions), '[]');
    row = db.prepare('SELECT * FROM daily_state WHERE discord_id = ?').get(discordId);
  }
  const streak = db.prepare('SELECT * FROM player_streaks WHERE discord_id = ?').get(discordId) || { streak: 0, best: 0, last_day: null };
  return {
    missions: missionsStatus(JSON.parse(row.missions), signalsFor(discordId)),
    claimed: JSON.parse(row.claimed || '[]'),
    checkin: Boolean(row.checkin),
    streak: streak.streak, best: streak.best, lastDay: streak.last_day,
  };
}

// One command collects the day: check-in (streak + day reward) + finished missions.
export function claimDaily(discordId, guildId) {
  const db = getDb();
  const p = getPlayer(discordId);
  const view = dailyView(discordId);
  const lines = [];
  // Check-in first (once per day).
  if (!view.checkin) {
    const s = db.prepare('SELECT * FROM player_streaks WHERE discord_id = ?').get(discordId) || { streak: 0, best: 0, last_day: null };
    const adv = advanceStreak({ streak: s.streak, lastDay: s.last_day }, dayKey());
    const today = dayKey();
    const best = Math.max(s.best || 0, adv.streak);
    db.prepare('INSERT INTO player_streaks (discord_id, streak, best, last_day) VALUES (?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET streak=?, best=?, last_day=?')
      .run(discordId, adv.streak, best, today, adv.streak, best, today);
    db.prepare('UPDATE daily_state SET checkin = 1 WHERE discord_id = ?').run(discordId);
    lines.push(...applyStreakReward(discordId, guildId, adv.streak));
    view.streak = adv.streak;
  }
  // Missions.
  const claimed = new Set(view.claimed);
  let allDone = true;
  for (const m of view.missions) {
    if (!m.done) { allDone = false; continue; }
    if (claimed.has(m.id)) continue;
    claimed.add(m.id);
    const cur = getPlayer(discordId);
    const { level, xp } = applyXp({ level: cur.level, xp: cur.xp }, MISSION_REWARD.xp);
    updatePlayer(discordId, { coins: cur.coins + MISSION_REWARD.coins, xp, level });
    lines.push(`🎯 ${m.text}: +${MISSION_REWARD.coins} coins, +${MISSION_REWARD.xp} XP.`);
  }
  db.prepare('UPDATE daily_state SET claimed = ? WHERE discord_id = ?').run(JSON.stringify([...claimed]), discordId);
  if (allDone && view.missions.length) {
    const cur = getPlayer(discordId);
    updatePlayer(discordId, { coins: cur.coins + ALL_CLEAR_BONUS.coins, energy: Math.min(cur.max_energy, cur.energy + ALL_CLEAR_BONUS.energy) });
    const watcher = activeContract(discordId)?.constellation_id;
    if (watcher) addFavor(discordId, watcher, ALL_CLEAR_BONUS.favor);
    lines.push(`🔥 ALL CLEAR: +${ALL_CLEAR_BONUS.coins} coins, +${ALL_CLEAR_BONUS.energy} energy${watcher ? `, favor +${ALL_CLEAR_BONUS.favor}` : ''}. The Stream applauds.`);
    if (guildId && guildId !== 'dm') recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `🔥 ${cur.name} cleared every daily contract. The Stream applauds.` });
  } else if (!view.missions.some((m) => m.done && !claimed.has(m.id))) {
    lines.push('Nothing new completed. The Stream waits.');
  }
  return { lines, streak: view.streak };
}

function applyStreakReward(discordId, guildId, streak) {
  const p = getPlayer(discordId);
  const reward = streakReward(streakDay(streak));
  const lines = [`📅 Day ${streak} check-in (streak day ${streakDay(streak)}): ${reward.text}.`];
  if (reward.coins) updatePlayer(discordId, { coins: p.coins + reward.coins });
  if (reward.energy) {
    const cur = getPlayer(discordId);
    updatePlayer(discordId, { energy: Math.min(cur.max_energy, cur.energy + reward.energy) });
  }
  if (reward.charges) {
    getDb().prepare('UPDATE player_stigmas SET charges = MIN(3, charges + 1) WHERE discord_id = ?').run(discordId);
  }
  if (reward.favor) {
    const watcher = activeContract(discordId)?.constellation_id;
    if (watcher) addFavor(discordId, watcher, reward.favor);
    else {
      const cur = getPlayer(discordId);
      updatePlayer(discordId, { coins: cur.coins + 100 });
      lines.push('No sponsor to honor — the Stream substitutes +100 coins.');
    }
  }
  if (reward.encounter) {
    lines.push(...runEncounter(discordId, guildId, true));
  }
  if (reward.knowledge) {
    const owned = new Set(playerKnowledgeIds(discordId));
    const secret = knowledge.find((k) => !owned.has(k.id) && ['observation', 'future', 'secret'].includes(k.kind));
    if (secret) {
      grantKnowledge(discordId, secret.id, 'streak');
      lines.push(`🎴 Day 7 secret: **${secret.title}**`);
      if (guildId && guildId !== 'dm') {
        recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `🌟 ${p.name} kept the Stream entertained for 7 days. It whispered back.` });
      }
    }
  }
  return lines;
}

// Encounters spend energy; the world decides what they meet.
export function encounterContext(discordId, guildId) {
  const p = getPlayer(discordId);
  const contract = activeContract(discordId);
  const trusts = getDb().prepare('SELECT npc_id, trust FROM npc_trust WHERE guild_id = ? AND discord_id = ?').all(guildId, discordId);
  const owned = new Set(playerKnowledgeIds(discordId));
  return {
    sponsored: Boolean(contract),
    sponsorId: contract?.constellation_id || null,
    maxTrust: Math.max(0, ...trusts.map((t) => t.trust)),
    topNpc: trusts.sort((a, b) => b.trust - a.trust)[0]?.npc_id || 'survivor_17',
    disturbance: getDb().prepare('SELECT disturbance FROM channel_state WHERE guild_id = ?').get(guildId)?.disturbance || 0,
    probability: p.probability,
    divergence: computeDivergence(guildId).score,
    hasUndiscovered: knowledge.some((k) => !owned.has(k.id) && ['observation', 'future'].includes(k.kind)),
    owned,
  };
}

export function runEncounter(discordId, guildId, free = false, rng = Math.random) {
  const db = getDb();
  const p = getPlayer(discordId);
  if (!free) {
    if (p.energy < ENCOUNTER_COST) throw new Error(`Too exhausted (need ${ENCOUNTER_COST} energy).`);
    updatePlayer(discordId, { energy: p.energy - ENCOUNTER_COST });
  }
  const ctx = encounterContext(discordId, guildId);
  const id = pickEncounter(buildWeights(ctx), rng);
  return applyEncounter(discordId, guildId, id, ctx);
}

export function applyEncounter(discordId, guildId, id, ctx = encounterContext(discordId, guildId)) {
  const db = getDb();
  const p = getPlayer(discordId);
  const lines = [];
  switch (id) {
    case 'constellation_notice': {
      const cid = ctx.sponsorId || 'judge_embers';
      const favor = addFavor(discordId, cid, 3);
      lines.push(`🌌 A constellation noticed you. Favor +3 (${favor}).`);
      break;
    }
    case 'npc_approach': {
      const trust = adjustTrust(guildId, ctx.topNpc, discordId, 5);
      lines.push(`👤 ${ctx.topNpc} approaches. Trust ${trust > 0 ? '+' : ''}${trust}.`);
      break;
    }
    case 'broadcast': {
      const flavors = [
        'A strange broadcast interrupts the Stream — static, then a voice counting down.',
        'The channel flickers. Somewhere, another server screams.',
        'A Dokkaebi test pattern. The audience boos.',
      ];
      const summary = `📡 ${flavors[Math.floor(Math.random() * flavors.length)]}`;
      if (guildId && guildId !== 'dm') recordEvent(guildId, { kind: 'broadcast', actorId: discordId, summary });
      lines.push(summary);
      break;
    }
    case 'probability_shift': {
      updatePlayer(discordId, { probability: Math.min(200, p.probability + 10) });
      lines.push('⚠️ Probability shifted in your favor. +10 probability.');
      break;
    }
    case 'discovery': {
      const owned = ctx.owned || new Set(playerKnowledgeIds(discordId));
      const find = knowledge.find((k) => !owned.has(k.id) && ['observation', 'future'].includes(k.kind));
      if (find) {
        grantKnowledge(discordId, find.id, 'encounter');
        lines.push(`🎴 You discovered something worth remembering: **${find.title}**`);
      } else {
        updatePlayer(discordId, { coins: p.coins + 50 });
        lines.push('🎴 Nothing new — but the walk paid +50 coins.');
      }
      break;
    }
    case 'sponsor_gift': {
      updatePlayer(discordId, { coins: p.coins + 250 });
      lines.push('⭐ Your sponsor approves. +250 coins.');
      break;
    }
    case 'dokja_sighting': {
      addAttention(guildId, 2);
      lines.push('👁 Kim Dokja was just here. Attention +2. He left quickly.');
      break;
    }
    case 'toll': {
      const cur = getPlayer(discordId);
      const loss = Math.min(40, cur.coins);
      updatePlayer(discordId, { coins: cur.coins - loss });
      addFavor(discordId, 'whispering_broker', 2);
      lines.push(`💸 The Ledger collects a small toll. -${loss} coins, Broker favor +2.`);
      break;
    }
    default: {
      const cur = getPlayer(discordId);
      const { level, xp } = applyXp({ level: cur.level, xp: cur.xp }, 10);
      updatePlayer(discordId, { xp, level });
      lines.push('🌫️ An uneventful patrol. +10 XP.');
    }
  }
  return lines;
}
