import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import { getPlayerParty } from '../game/parties/store.js';
import { runBattle, combatRewards } from '../game/combat/engine.js';
import { buildCombatantFromPlayer, monsterToCombatant } from '../game/combat/fromPlayer.js';
import { saveCombatLog, getMastery, addMastery, playerStigmas, honoredPairsFor, recordSaves } from '../game/combat/store.js';
import { assessOdds, gambitLine } from '../game/combat/probability.js';
import { UNLEASH_MULT, checkEvolution, evolutionHint, stigmaDef } from '../game/combat/stigma.js';
import { savesFromLog, BOND_SAVES_REQUIRED } from '../game/combat/synergy.js';
import { factionModifier, revealBonus } from '../game/combat/conditions.js';
import { applyXp, levelUpGains } from '../game/progression/levels.js';
import { playerKnowledgeIds, setKnowledgeScope, grantKnowledge, recordEvent } from '../game/world/store.js';
import { storyFromAchievement } from '../game/stories/system.js';
import { storyCardFor, mintStoryCard } from '../game/cards/mint.js';
import { addAttention } from '../game/canon/store.js';
import { die, requireAlive } from '../game/incarnations/lifecycle.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { panel, verr, artPanel } from '../utils/v2.js';
import { imageForEntity } from '../utils/images.js';
import { embedTutorial, refreshTutorialMessage } from '../game/tutorial/progress.js';
import { getCompanion, unequipCompanion, recordCompanionFight, companionHistory } from '../game/cards/characters.js';
import { companionCombatant, companionOpening, synergyBonus, effectiveStage, bondLevel, companionTalk } from '../game/combat/companions.js';
import { scheduleEcho, echoFor } from '../game/world/echoes.js';
import { bumpCounter } from '../game/titles/counters.js';
import { evaluateTitles } from '../game/titles/evaluate.js';
import { emTitle } from '../game/display/emojis.js';
import { perksFor } from '../game/titles/perks.js';
import { emit } from '../game/events/bus.js';
import monsters from '../../data/monsters.json' with { type: 'json' };

const FOCUS = ['front', 'lowest_hp', 'highest_power', 'random'];

export const data = new SlashCommandBuilder()
  .setName('pve')
  .setDescription('Party PvE battle')
  .addStringOption((o) => o.setName('monster').setDescription(monsters.map((m) => m.id).join(', ')).setRequired(true))
  .addStringOption((o) => o.setName('focus').setDescription('Target selection: ' + FOCUS.join(', ')))
  .addBooleanOption((o) => o.setName('gambit').setDescription('Fight recklessly: ruin or legend'))
  .addBooleanOption((o) => o.setName('stigma').setDescription('Unleash your stigma (1 charge)'))
  .addStringOption((o) => o.setName('reveal').setDescription('Reveal a Knowledge id to the party (costs 10 energy)'));

function summarize(log, max = 12) {
  const lines = log.map((e) => `R${e.round} ${e.text}`);
  return lines.length > max ? [...lines.slice(0, max), `… (${lines.length - max} more)`].join('\n') : lines.join('\n');
}

export async function execute(interaction) {
  const db = (await import('../database/db.js')).getDb();
  const guildId = interaction.guildId || 'dm';
  const me = getPlayer(interaction.user.id);
  if (!me) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const dead = requireAlive(me);
  if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
  const wait = checkCooldown(me.discord_id, 'pve', COOLDOWNS.pve);
  if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'pve')), ephemeral: true });
  if (!tryBurst(me.discord_id, 'pve')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
  try {
    const mon = monsters.find((m) => m.id === interaction.options.getString('monster', true));
  if (!mon) return interaction.reply({ ...verr(`Unknown monster. Try: ${monsters.map((m) => m.id).join(', ')}`), ephemeral: true });
  const focus = interaction.options.getString('focus') || 'front';
  if (!FOCUS.includes(focus)) return interaction.reply({ ...verr(`Focus must be: ${FOCUS.join(', ')}`), ephemeral: true });
  const gambit = interaction.options.getBoolean('gambit') || false;
  const useStigma = interaction.options.getBoolean('stigma') || false;
  const revealId = interaction.options.getString('reveal');

  const group = getPlayerParty(me.discord_id);
  const members = group ? group.members : [{ ...me, role: 'Damage' }];
  const faction = factionModifier(guildId, me.discord_id);
  const honored = honoredPairsFor(guildId, members.map((m) => m.discord_id));
  let revealPct = 0;
  const extraLines = [];
  if (faction.line) extraLines.push(faction.line);

  // Information as ammunition: reveal knowledge to the party.
  if (revealId) {
    const owned = playerKnowledgeIds(me.discord_id);
    if (!owned.includes(revealId)) return interaction.reply({ ...verr('You do not hold that knowledge.'), ephemeral: true });
    const revealCost = Math.max(5, 10 - perksFor(me.discord_id, { always: true }).energy);
    if (me.energy < revealCost) return interaction.reply({ ...verr(`Too exhausted to brief the party (need ${revealCost} energy).`), ephemeral: true });
    updatePlayer(me.discord_id, { energy: me.energy - revealCost });
    me.energy -= revealCost;
    const bonus = revealBonus(revealId, mon);
    revealPct = bonus.pct;
    extraLines.push(bonus.line);
    // Revealed knowledge spreads — and the enemy notices the leak.
    setKnowledgeScope(me.discord_id, revealId, 'public');
    db.prepare('UPDATE player_knowledge SET shared_with = NULL WHERE discord_id = ? AND knowledge_id = ?').run(me.discord_id, revealId);
    extraLines.push('_The revelation spreads through the stream — and the enemy stirs._');
  }

  // Stigma unleash: one charge, double fury, mastery recorded.
  let unleashed = null;
  if (useStigma) {
    const row = playerStigmas(me.discord_id).filter((s) => s.charges > 0).sort((a, b) => b.level - a.level)[0];
    if (!row) return interaction.reply({ ...verr('No stigma with charges. Contracts grant stigmas; scenarios restore charges.'), ephemeral: true });
    db.prepare('UPDATE player_stigmas SET charges = charges - 1 WHERE discord_id = ? AND stigma_id = ?').run(me.discord_id, row.stigma_id);
    unleashed = row;
    emit('stigma_used', { guildId, playerId: me.discord_id, stigmaId: row.stigma_id });
  }

  const sideA = members.map((m) =>
    buildCombatantFromPlayer(m, { role: m.role || 'Damage', team: 'A', partyMembers: members, factionBonus: faction.combatPct + revealPct, contextScenario: mon.scenario, honoredPairs: honored })
  );
  const foe = monsterToCombatant(mon, { team: 'B' });
  // Companion: an owned character fighting as one of your life, not a summon.
  let compDef = getCompanion(me.discord_id);
  let compOpening = { entries: [], rewardPct: 0 };
  if (compDef) {
    const stillOwned = db.prepare('SELECT card_id FROM story_cards WHERE discord_id = ? AND card_id = ?').get(me.discord_id, compDef.id);
    if (!stillOwned) {
      unequipCompanion(me.discord_id);
      compDef = null;
    } else {
      // Progression over rank: synergy with your build, bond from shared life,
      // and a signature that evolves only once trust is earned.
      const tags = [
        ...db.prepare('SELECT attribute_id AS t FROM player_attributes WHERE discord_id = ?').all(me.discord_id),
        ...db.prepare('SELECT skill_id AS t FROM player_skills WHERE discord_id = ?').all(me.discord_id),
        ...db.prepare('SELECT story_id AS t FROM player_stories WHERE discord_id = ?').all(me.discord_id),
      ].map((r) => r.t);
      const prog = companionHistory(me.discord_id, compDef.id);
      const blvl = bondLevel(prog?.bond);
      const stage = effectiveStage(prog?.mastery, prog ? prog.trust : 10);
      const comp = companionCombatant(compDef, 'A', { synergy: synergyBonus(compDef, tags), bondLevel: blvl });
      sideA.push(comp);
      compOpening = companionOpening(comp, sideA, [foe], compDef, Math.random, stage);
      if (compOpening.entries.length) extraLines.push(`${compOpening.entries[0].text} _[bond ${blvl}, mastery ${stage}]_`);
    }
  }
  if (unleashed && sideA[0]) {
    sideA[0].build.skillMult *= UNLEASH_MULT;
    addMastery(me.discord_id, unleashed.stigma_id, { uses: 1 });
  }
  const odds = assessOdds(sideA, [foe]);
  if (gambit || odds.improbable) extraLines.push(gambitLine(odds.band));

  emit('combat_started', { guildId, kind: 'pve', monster: mon.id });
  const battle = runBattle(sideA, [foe], { scenarioTier: mon.tier || 1, focusA: focus });
  const winner = battle.winner;
  const rounds = battle.rounds;
  const timeout = battle.timeout;
  const log = [...compOpening.entries, ...battle.log];
  emit('combat_finished', { guildId, kind: 'pve', winner });

  const victory = winner === 'A';
  const partial = timeout && victory; // survived the clock, didn't finish it
  const levelGap = Math.max(0, ...members.map((m) => Math.abs(m.level - foe.level)));
  const titleCtx = {
    always: true, solo: members.length === 1 && !compDef, party: members.length > 1 || Boolean(compDef),
    gambit, underdog: odds.ratio < 1, elite: (mon.tier || 1) >= 3, spectacle: odds.improbable,
  };
  const base = combatRewards({ victory, monsterPower: mon.power || 10, partySize: members.length, levelGap, titlePct: perksFor(me.discord_id, titleCtx).reward });
  const fortuneBonus = compDef ? compOpening.rewardPct : 0;
  const scaled = { coins: base.coins + Math.floor(base.coins * fortuneBonus / 100), xp: base.xp };
  const rewards = partial ? { coins: Math.floor(scaled.coins / 2), xp: Math.floor(scaled.xp / 2) } : scaled;
  const results = [];
  for (let i = 0; i < members.length; i++) {
    const c = sideA[i];
    const m = members[i];
    const { level, xp, leveled } = applyXp({ level: m.level, xp: m.xp }, victory ? rewards.xp : 5);
    const patch = { xp, level, coins: m.coins + (victory ? rewards.coins : 5), hp: Math.max(1, Math.min(m.max_hp, c.hp)), energy: Math.max(0, c.energy) };
    if (leveled.length) {
      const g = levelUpGains();
      Object.assign(patch, { max_hp: m.max_hp + g.max_hp * leveled.length, hp: m.max_hp + g.max_hp * leveled.length });
    }
    updatePlayer(m.discord_id, patch);
    results.push(`${m.name}: +${victory ? rewards.coins : 5} coins, +${victory ? rewards.xp : 5} XP${leveled.length ? ` — LEVEL UP Lv ${level}` : ''}`);
  }

  // Stigma mastery: shields (heal/guard) + unleashes feed evolution.
  const evolved = [];
  const masteryNotes = [];
  for (const c of sideA) {
    const rows = playerStigmas(c.id);
    if (!rows.length) continue;
    const protects = log.filter((e) => (e.type === 'heal' || e.type === 'guard') && e.actorId === c.id).length;
    for (const s of rows) {
      const mastery = addMastery(c.id, s.stigma_id, { protects });
      const evo = checkEvolution(s.stigma_id, s.level, mastery);
      if (evo) {
        db.prepare('UPDATE player_stigmas SET level = ?, charges = 3 WHERE discord_id = ? AND stigma_id = ?').run(evo, c.id, s.stigma_id);
        evolved.push({ name: c.name, stigma: stigmaDef(s.stigma_id)?.name || s.stigma_id, level: evo });
        emit('stigma_evolved', { guildId, playerId: c.id, stigmaId: s.stigma_id, level: evo });
      } else if (c.id === me.discord_id) {
        masteryNotes.push(`${stigmaDef(s.stigma_id)?.name || s.stigma_id}: ${evolutionHint(s.stigma_id, s.level, mastery)}`);
      }
    }
  }

  // Bonds: repeated saves become party Stories.
  const survivors = sideA.filter((c) => c.hp > 0).map((c) => c.id);
  const pairs = savesFromLog(log, survivors).filter(([a, b]) => members.some((m) => m.discord_id === a) && members.some((m) => m.discord_id === b));
  const newly = recordSaves(guildId, pairs, BOND_SAVES_REQUIRED);
  for (const [a, b] of newly) {
    const def = storyFromAchievement('survived_together');
    for (const pid of [a, b]) {
      db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(pid, def.id);
      mintStoryCard(db, pid, { card_id: `${def.id}@${a.slice(0, 4)}${b.slice(0, 4)}`, name: `[${def.name}]`, scenario_id: mon.scenario || '—', effect: 'Two incarnations kept saving each other until the stream itself took note.', power: def.power });
    }
    extraLines.push(`🎴 Party Story born: **[${def.name}]** — two lives braided together, and the Stream writes the knot. Some bonds are forged in fire; this one was forged in the moment one of you stopped moving.`);
    emit('party_synergy', { guildId, pair: [a, b] });
    if (guildId !== 'dm') recordEvent(guildId, { kind: 'world_event', actorId: a, summary: `🎴 Party Story born: [${def.name}].` });
  }

  // Probability defied: gambit victory against worse than 1:2 becomes legend — or ruin.
  let deathRecorded = false;
  if (gambit) {
    if (victory && odds.ratio < 0.5) {
      const def = storyFromAchievement('defied_probability');
      db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(me.discord_id, def.id);
      const card = storyCardFor({ storyId: def.id, storyName: def.name, scenarioId: mon.scenario || '?', choiceId: 'lure', power: def.power });
      mintStoryCard(db, me.discord_id, card);
      addAttention(guildId, 6);
      grantKnowledge(me.discord_id, 'dokja_watching_you', 'dokja');
      extraLines.push(`🎴 **[${def.name}]** — the stream roars. Dokja attention +6. 👁 *Dokja Is Watching You.* The reader who finished the story has seen your choice, and he is writing about it.`);
      emit('probability_disturbed', { guildId, playerId: me.discord_id, kind: 'gambit' });
      const uecho = echoFor.underdog(me.name);
      scheduleEcho(guildId, uecho.kind, uecho.summary, uecho.delayMs);
      if (guildId !== 'dm') recordEvent(guildId, { kind: 'world_event', actorId: me.discord_id, summary: `🎴 ${me.name} defied probability against ${mon.name}. [${def.name}]` });
    } else if (!victory) {
      updatePlayer(me.discord_id, { hp: 1, energy: 0 });
      extraLines.push('💥 Backlash: the gambit fails catastrophically. The Stream does not forgive recklessness — it punishes it publicly. You are left at 1 HP, gasping, and the audience is still watching.');
      // Death only dares the worthy: a failed gambit against a high-tier foe can kill.
      if (gambit && (mon.tier || 1) >= 3 && die(me.discord_id, guildId, `a failed gambit against ${mon.name}`)) {
        extraLines.push(`🕯️ **${me.name} has fallen.** The Stream remembers — see \`/incarnation record\`.`);
        if (compDef) {
          recordCompanionFight(me.discord_id, compDef.id, { victory: false, playerName: me.name, ownerDied: true });
          deathRecorded = true;
        }
      }
    }
  }
  if (timeout) extraLines.push(partial ? '⏱ Partial success: you survived the clock but the foe stands. The Stream counts this as a mercy, not a victory.' : '⏱ The clock ran out. Time is the one opponent you cannot bargain with.');

  // Titles watch: every real act feeds epithets.
  {
    const meC = sideA.find((c) => c.id === me.discord_id);
    if (gambit) bumpCounter(me.discord_id, 'gambits');
    if (gambit && victory && odds.ratio < 0.5) bumpCounter(me.discord_id, 'improbable_wins');
    if (victory && odds.ratio < 1) bumpCounter(me.discord_id, 'underdog_wins');
    if (victory && (mon.tier || 1) >= 3) bumpCounter(me.discord_id, 'tier3_wins');
    if (victory && meC && meC.hp <= meC.maxHp * 0.3) bumpCounter(me.discord_id, 'clutch_wins');
    const myProtects = log.filter((e) => (e.type === 'heal' || e.type === 'guard') && e.actorId === me.discord_id).length;
    if (myProtects) bumpCounter(me.discord_id, 'protects', myProtects);
    if (revealId) bumpCounter(me.discord_id, 'reveals');
    for (const m of members) {
      const { fresh } = evaluateTitles(m.discord_id, guildId);
      if (m.discord_id === me.discord_id && fresh.length) {
        extraLines.push(`👑 Title earned: ${fresh.map((d) => `${emTitle(d.id, d.emoji)} **${d.name}**`).join(', ')}`);
      }
    }
  }

  // Companion history: only real fights count, and only notable ones are named.
  if (compDef && !deathRecorded) {
    recordCompanionFight(me.discord_id, compDef.id, { victory, gambitWin: Boolean(gambit && victory && odds.ratio < 0.5), playerName: me.name });
    const hist = companionHistory(me.discord_id, compDef.id);
    if (hist) extraLines.push(`🤝 ${compDef.name}: ${hist.uses} battles, ${hist.victories} victories.`);
    // The living comment on the living.
    if (Math.random() < 0.4) {
      extraLines.push(`💬 ${companionTalk(compDef, { bond: hist?.bond || 0, trust: hist?.trust ?? 10 })}`);
    }
  }

  saveCombatLog({ kind: 'pve', participants: [...members.map((m) => m.discord_id), ...(compDef ? [`companion:${compDef.id}`] : [])], winnerId: victory ? members[0].discord_id : mon.id, log, rewards });
  const head = victory ? (odds.improbable ? '**IMPOSSIBLE VICTORY**' : '**VICTORY**') : '**DEFEAT**';
  setCooldown(me.discord_id, 'pve', COOLDOWNS.pve);
  const payload = artPanel({
    title: `⚔️ ${head} vs ${mon.name} (${rounds} rounds)`,
    body: `${summarize(log)}${extraLines.length ? `\n\n${extraLines.join('\n')}` : ''}\n\n${results.join('\n')}` +
      (evolved.length ? `\n\n✨ Stigma evolution: ${evolved.map((e) => `${e.name}'s [${e.stigma}] → Level ${e.level}`).join('; ')}` : '') +
      (masteryNotes.length ? `\n-# ${masteryNotes.join(' | ')}` : ''),
    image: imageForEntity(mon),
  });
  embedTutorial(payload, me.discord_id, 'pve', interaction.prefix || null);
  await interaction.reply(payload);
  if (interaction.client) refreshTutorialMessage(interaction.client, me.discord_id, interaction.prefix || null).catch(() => null);
  } finally {
    clearBurst(me.discord_id, 'pve');
  }
}
