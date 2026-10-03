import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { nextScenario, getScenario, resolveChoice } from '../game/scenarios/engine.js';
import { applyXp } from '../game/progression/levels.js';
import { scenarioReward } from '../game/economy/coins.js';
import { reactToOutcome } from '../game/constellations/system.js';
import { broadcastComponents } from '../utils/embeds.js';
import { sep, v2, streamPanel, panel, verr, td, V2 } from '../utils/v2.js';
import { visibleChoices, requireChoiceAccess, readerBrief } from '../game/knowledge/system.js';
import { embedTutorial, refreshTutorialMessage } from '../game/tutorial/progress.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { attentionDeltaFor } from '../game/canon/dokja.js';
import { addAttention, grantDokjaKnowledge } from '../game/canon/store.js';
import { disturbanceLines, worldEventSummary } from '../game/world/memory.js';
import { playerKnowledgeIds, getOrCreateInstance, markAltered, recordEvent, adjustTrust, appendKnownEvent } from '../game/world/store.js';
import { getPrefix } from '../game/world/echoes.js';
import { storyFromAchievement } from '../game/stories/system.js';
import { storyCardFor, mintStoryCard } from '../game/cards/mint.js';
import { addFavor, checkForOffer, reviewContracts } from '../game/sponsors/contracts.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { factionModifier } from '../game/combat/conditions.js';
import { bumpCounter } from '../game/titles/counters.js';
import { evaluateTitles } from '../game/titles/evaluate.js';
import { emTitle } from '../game/display/emojis.js';
import { perksFor } from '../game/titles/perks.js';
import { getPlayerParty } from '../game/parties/store.js';
import { scheduleEcho, echoFor } from '../game/world/echoes.js';
import { emit } from '../game/events/bus.js';

export const data = new SlashCommandBuilder()
  .setName('scenario')
  .setDescription('Scenario actions')
  .addSubcommand((s) => s.setName('current').setDescription('Show current scenario'))
  .addSubcommand((s) =>
    s.setName('decide').setDescription('Make a choice').addStringOption((o) => o.setName('choice').setDescription('choice id').setRequired(true))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const sc = nextScenario(p.scenario_progress);
  if (!sc) return interaction.reply(streamPanel({ level: 'system', icon: '📖', title: '📖 SCENARIO', bodyLines: ['No further scenarios yet. You are caught up with the stream.'] }));

  if (sub === 'current') {
    const menuPanel = currentMenuPayload(p);
    if (!menuPanel) return interaction.reply(streamPanel({ level: 'system', icon: '📖', title: '📖 SCENARIO', bodyLines: ['No further scenarios yet. You are caught up with the stream.'] }));
    embedTutorial(menuPanel.panel, interaction.user.id, 'scenario_current');
    await interaction.reply({
      components: [...menuPanel.panel.components, menuPanel.row],
      flags: V2,
      ephemeral: true,
    });
    refreshTutorialMessage(interaction.client, interaction.user.id, null).catch(() => null);
    return;
  }

  await applyDecision(interaction, sc, interaction.options.getString('choice', true), false);
}

// Shared builder: the private scenario menu. Returns null when caught up.
// Used by /scenario current and the tutorial completion's Enter Scenario gate.
export function currentMenuPayload(p) {
  const sc = nextScenario(p.scenario_progress);
  if (!sc) return null;
  const owned = playerKnowledgeIds(p.discord_id);
  const vis = visibleChoices(sc, owned);
  const open = vis.filter((v) => !v.locked);
  const lockedCount = vis.length - open.length;
  const reader = vis.some((v) => v.locked);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`scenario:${sc.id}`)
    .setPlaceholder('Choose your action')
    .addOptions(open.map((v) => ({ label: v.choice.label.slice(0, 100), value: v.choice.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  // Asymmetric briefs: readers see what others cannot. Ephemeral — information is a resource.
  const brief = reader ? `\n\n👁 *${readerBrief()}*` : '';
  const locked = lockedCount ? `\n-# ${lockedCount} option(s) sense something you do not know...` : '';
  return { panel: panel({ title: `[${sc.id}] ${sc.title}`, body: `${sc.description}${brief}${locked}` }), row };
}

export async function handleEnterScenarioButton(interaction) {
  const owner = (interaction.customId || '').split(':')[2] || null;
  if (owner && interaction.user.id !== owner) {
    return safeReply(interaction, { ...verr(`That gate belongs to <@${owner}> — finish your own tutorial to open yours.`), ephemeral: true });
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return safeReply(interaction, { ...verr('Use /register first.'), ephemeral: true });
  const menu = currentMenuPayload(p);
  if (!menu) return safeReply(interaction, panel({ title: '📖 SCENARIO', body: 'No further scenarios yet. You are caught up with the stream.' }));
  await safeReply(interaction, { components: [...menu.panel.components, menu.row], flags: V2, ephemeral: true });
}

// Discord tokens expire fast (3s to first ack). The decide pipeline does heavy
// synchronous work (rewards, titles, sponsors, echoes) before answering, so a
// select-menu click can arrive with an already-dead token (10062). These
// helpers degrade gracefully: expired interactions just have nothing to show.
function isDeadInteraction(e) {
  return e?.code === 10062 || e?.status === 404;
}

async function safeUpdate(interaction, payload) {
  try {
    if (interaction.deferred) await interaction.editReply(payload);
    else await interaction.update(payload);
  } catch (e) {
    if (isDeadInteraction(e)) return;
    throw e;
  }
}

async function safeReply(interaction, payload) {
  try {
    await interaction.reply(payload);
  } catch (e) {
    if (isDeadInteraction(e)) return;
    throw e;
  }
}

async function safeFollowUp(interaction, payload) {
  try {
    await interaction.followUp(payload);
  } catch (e) {
    if (isDeadInteraction(e)) return;
    throw e;
  }
}

// Shared pipeline: slash decide + select-menu handler. Game logic stays in game/ modules.
async function applyDecision(interaction, sc, choiceId, isUpdate) {
  const db = getDb();
  const p = getPlayer(interaction.user.id);
  const dead = requireAlive(p);
  if (dead) {
    const msg = { ...verr(dead), ephemeral: true };
    return isUpdate ? safeUpdate(interaction, { ...msg, components: [] }) : safeReply(interaction, msg);
  }
  const owned = playerKnowledgeIds(p.discord_id);
  const choice = sc.choices.find((c) => c.id === choiceId);
  if (!choice) {
    const msg = { ...verr('Invalid choice.'), ephemeral: true };
    return isUpdate ? safeUpdate(interaction, { ...msg, components: [] }) : safeReply(interaction, msg);
  }
  try {
    requireChoiceAccess(choice, owned);
  } catch (e) {
    const msg = { ...verr(e.message), ephemeral: true };
    return isUpdate ? safeUpdate(interaction, { ...msg, components: [] }) : safeReply(interaction, msg);
  }
  // 10-min per-player cooldown on the act itself (viewing `current` stays free).
  const wait = checkCooldown(p.discord_id, 'scenario', COOLDOWNS.scenario);
  if (wait) {
    const msg = { ...verr(cooldownMessage(wait, 'scenario')), ephemeral: true };
    return isUpdate
      ? (interaction.replied || interaction.deferred ? safeFollowUp(interaction, msg) : safeUpdate(interaction, { ...msg, components: [] }))
      : safeReply(interaction, msg);
  }
  if (!tryBurst(p.discord_id, 'scenario')) {
    const msg = { ...verr(burstMessage()), ephemeral: true };
    return isUpdate
      ? (interaction.replied || interaction.deferred ? safeFollowUp(interaction, msg) : safeUpdate(interaction, { ...msg, components: [] }))
      : safeReply(interaction, msg);
  }
  try {
    setCooldown(p.discord_id, 'scenario', COOLDOWNS.scenario);
    const out = resolveChoice(sc, choiceId);
  const gid = interaction.guildId;
  const fmod = gid ? factionModifier(gid, p.discord_id) : null;
  const inParty = Boolean(getPlayerParty(p.discord_id));
  // Equipped epithets pay out: peace rewards peace, breaks reward breaks.
  const titleCtx = {
    always: true, party: inParty, solo: !inParty,
    peaceful: ['help', 'forewarn'].includes(choiceId), story: Boolean(out.story),
    altered: Boolean(choice.altersWorld && out.success),
  };
  const titleBonus = perksFor(p.discord_id, titleCtx).reward;
  const baseReward = scenarioReward(out.coins || 0, { level: p.level, titleBonusPct: titleBonus });
  const reward = baseReward + Math.floor(baseReward * ((fmod?.rewardPct || 0) / 100));
  const { level, xp, leveled } = applyXp(p, out.xp || 0);
  const cleared = out.success ? 1 : 0;
  updatePlayer(p.discord_id, {
    coins: p.coins + reward,
    xp, level,
    hp: p.max_hp,
    scenario_progress: p.scenario_progress + cleared,
  });
  let minted = null;
  if (out.story) {
    db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?, ?)').run(p.discord_id, out.story);
    // Journey cards: your collection is a record of what you lived through.
    const def = storyFromAchievement(out.story === 'merciful' || out.story === 'impossible' ? out.story : 'first_scenario');
    if (def) {
      minted = storyCardFor({ storyId: def.id, storyName: def.name, scenarioId: sc.id, choiceId, power: def.power });
      mintStoryCard(db, p.discord_id, minted);
    }
  }
  db.prepare('INSERT INTO scenario_log (discord_id, scenario_id, choice, outcome, coins) VALUES (?,?,?,?,?)')
    .run(p.discord_id, sc.id, choiceId, out.success ? 'success' : 'fail', reward);

  // The world reacts: shared memory, NPC trust, altered predetermined events.
  const guildId = interaction.guildId;
  let altered = false;
  const sponsorLines = [];
  if (guildId) {
    // The watching constellation's favor moves with every outcome.
    if (sc.watcher && out.favor) {
      const favorBonus = perksFor(p.discord_id, { always: true }).favor;
      addFavor(p.discord_id, sc.watcher, (out.success ? out.favor : Math.floor(out.favor / 2)) + favorBonus);
    }
    for (const t of out.npcTrust || []) {
      adjustTrust(guildId, t.npc, p.discord_id, t.delta);
      appendKnownEvent(guildId, t.npc, `${out.success ? 'Helped' : 'Met'} by ${p.name} in Scenario ${sc.id}`);
    }
    if (cleared) {
      recordEvent(guildId, { kind: 'scenario_clear', actorId: p.discord_id, summary: worldEventSummary('scenario_clear', p.name, `Scenario ${sc.id}`) });
      emit('scenario_cleared', { guildId, playerId: p.discord_id });
      if (!inParty) bumpCounter(p.discord_id, 'solo_clears');
      // Stigmas breathe: surviving restores a charge.
      db.prepare('UPDATE player_stigmas SET charges = MIN(3, charges + 1) WHERE discord_id = ?').run(p.discord_id);
      for (const d of evaluateTitles(p.discord_id, guildId).fresh) {
        sponsorLines.push(`👑 Title earned: ${emTitle(d.id, d.emoji)} **${d.name}**`);
      }
      if (fmod?.line) sponsorLines.push(fmod.line);
    }
    if (choice.altersWorld && out.success) {
      altered = true;
      markAltered(guildId, sc.id, p.discord_id, `${p.name} changed the predetermined event.`);
      recordEvent(guildId, { kind: 'scenario_altered', actorId: p.discord_id, summary: worldEventSummary('scenario_altered', p.name, `Scenario ${sc.id}`) });
      // The aftershock arrives later, when they have stopped looking over their shoulder.
      const echo = echoFor.altered(p.name, sc.id);
      scheduleEcho(guildId, echo.kind, echo.summary, echo.delayMs);
      // Dokja notices. The canon layer learns what the divergence taught it.
      addAttention(guildId, attentionDeltaFor('altered'));
      grantDokjaKnowledge(guildId, `altered_${sc.id}`, 'altered');
      emit('scenario_altered', { guildId, playerId: p.discord_id, scenarioId: sc.id });
    }
    if (choice.requiresKnowledge && out.success) {
      addAttention(guildId, attentionDeltaFor('foreknow'));
    }
    getOrCreateInstance(guildId, sc.id);
    if (cleared) {
      // Attention earned: new offers may arrive, live contracts are reviewed.
      const fresh = getPlayer(p.discord_id);
      for (const cid of checkForOffer(fresh, guildId)) {
        const { constellationName } = await import('../game/constellations/wallets.js');
        sponsorLines.push(`📡 A constellation (${constellationName(cid)}) has noticed your actions. See \`/sponsor offers\`.`);
      }
      sponsorLines.push(...reviewContracts(fresh, guildId));
    }
  }

  const lines = reactToOutcome(out.success ? 'success' : 'fail');
  const outcome = panel({
    title: out.success ? '✅ SCENARIO CLEARED' : '🌫️ SCENARIO',
    body:
      `${out.text}\n+${reward} coins, +${out.xp || 0} XP${leveled.length ? ` — **Level up! Lv ${level}**` : ''}` +
      `${minted ? `\n🎴 Journey card minted: **${minted.name}**` : ''}` +
      `${sponsorLines.length ? `\n\n${sponsorLines.join('\n')}` : ''}` +
      `${cleared ? '' : '\nScenario not cleared — try again.'}`,
  });
  // Menus carry their origin: `scenario:<id>` (slash) vs
  // `scenario:<id>:<owner>` (prefix). Teach the interface in use.
  const tutPrefix = isUpdate && (interaction.customId || '').split(':').length >= 3 ? getPrefix(interaction.guildId) : null;
  embedTutorial(outcome, interaction.user.id, 'scenario_decide', tutPrefix);
  const payload = {
    components: [...outcome.components, sep(), ...broadcastComponents(lines), ...(altered ? [sep(), ...broadcastComponents(disturbanceLines(p.name, `Scenario ${sc.id}`))] : [])],
    flags: V2,
  };
  if (isUpdate) {
    await safeUpdate(interaction, payload);
  } else {
    await safeReply(interaction, payload);
  }
  refreshTutorialMessage(interaction.client, interaction.user.id, tutPrefix).catch(() => null);
  } finally {
    clearBurst(p.discord_id, 'scenario');
  }
}

// Button/select handler for scenario menus (slash + prefix share it).
// customId: `scenario:<id>` (slash, ephemeral) or `scenario:<id>:<owner>` (prefix, public).
export async function handleMenu(interaction) {
  const parts = interaction.customId.split(':');
  const scenarioId = parts[1];
  const ownerId = parts.length >= 3 ? parts[2] : null;
  if (ownerId && interaction.user.id !== ownerId) {
    return interaction.reply({
      ...verr(`That menu belongs to <@${ownerId}> — run \`orv sc\` or \`/scenario current\` to get your own.`),
      ephemeral: true,
    });
  }
  const sc = getScenario(scenarioId);
  if (!sc) {
    try {
      return await interaction.update(v2('That scenario has faded from the stream.'));
    } catch (e) {
      if (isDeadInteraction(e)) return;
      throw e;
    }
  }
  // Ack FIRST: the pipeline below is heavy and the 3s token window is short.
  // After defer, answers go through editReply/followUp (see safeUpdate).
  try {
    await interaction.deferUpdate();
  } catch (e) {
    if (isDeadInteraction(e)) return;
    throw e;
  }
  await applyDecision(interaction, sc, interaction.values[0], true);
}
