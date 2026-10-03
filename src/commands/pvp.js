import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { runBattle } from '../game/combat/engine.js';
import { buildCombatantFromPlayer } from '../game/combat/fromPlayer.js';
import { canPvp, eloUpdate, pvpSpoils, CHALLENGE_TTL_S } from '../game/combat/pvp.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { getRating, recordPvpResult, fightsToday, saveCombatLog, createChallenge, pendingFor, resolveChallenge } from '../game/combat/store.js';
import { applyXp, levelUpGains } from '../game/progression/levels.js';
import { streamPanel, panel, verr, v2, sheet } from '../utils/v2.js';

const FOCUS = ['front', 'lowest_hp', 'highest_power', 'random'];

export const data = new SlashCommandBuilder()
  .setName('pvp')
  .setDescription('PvP duels with ELO')
  .addSubcommand((s) =>
    s.setName('challenge').setDescription('Challenge a registered player').addUserOption((o) => o.setName('opponent').setDescription('Who to duel').setRequired(true))
  )
  .addSubcommand((s) => s.setName('accept').setDescription('Accept your pending duel'))
  .addSubcommand((s) => s.setName('decline').setDescription('Decline your pending duel'))
  .addSubcommand((s) => s.setName('rank').setDescription('Show PvP ELO rankings'));

function expired(ch) {
  return (Date.now() - new Date(ch.created_at + 'Z').getTime()) / 1000 > CHALLENGE_TTL_S;
}

function fightSummary(log, max = 10) {
  const lines = log.map((e) => `R${e.round} ${e.text}`);
  return lines.length > max ? [...lines.slice(0, max), `… (${lines.length - max} more)`].join('\n') : lines.join('\n');
}

async function resolveDuel(challengerId, opponentId) {
  const c = getPlayer(challengerId);
  const o = getPlayer(opponentId);
  const sideA = [buildCombatantFromPlayer(c, { role: 'Damage', team: 'A' })];
  const sideB = [buildCombatantFromPlayer(o, { role: 'Damage', team: 'B' })];
  const scenarioTier = Math.min(c.level, o.level);
  const { winner, rounds, log } = runBattle(sideA, sideB, { scenarioTier });
  const winnerId = winner === 'A' ? challengerId : opponentId;
  const loserId = winner === 'A' ? opponentId : challengerId;
  const wRow = getPlayer(winnerId);
  const lRow = getPlayer(loserId);
  const wRate = getRating(winnerId);
  const lRate = getRating(loserId);
  const { winnerElo, loserElo } = eloUpdate(wRate.elo, lRate.elo);
  recordPvpResult({ winnerId, loserId, winnerElo, loserElo });
  const spoils = pvpSpoils({ winnerLevel: wRow.level, loserLevel: lRow.level });
  for (const [row, isWin] of [[wRow, true], [lRow, false]]) {
    const { level, xp, leveled } = applyXp({ level: row.level, xp: row.xp }, isWin ? spoils.xp : 10);
    const patch = { xp, level, coins: row.coins + (isWin ? spoils.coins : 10) };
    if (leveled.length) {
      const g = levelUpGains();
      patch.max_hp = row.max_hp + g.max_hp * leveled.length;
      patch.hp = patch.max_hp;
    }
    updatePlayer(row.discord_id, patch);
  }
  saveCombatLog({ kind: 'pvp', participants: [challengerId, opponentId], winnerId, log, rewards: spoils });
  const w = getPlayer(winnerId);
  return streamPanel({
    level: 'important',
    icon: '⚔️',
    title: `⚔️ ${w.name} wins`,
    bodyLines: `${rounds} rounds, ELO ${winnerElo} vs ${loserElo}\n${fightSummary(log)}\n+${spoils.coins} coins, +${spoils.xp} XP to the victor.`.split('\n'),
  });
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const me = getPlayer(interaction.user.id);
  if (!me && sub !== 'rank') return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  if (me && sub !== 'rank') {
    const dead = requireAlive(me);
    if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
  }

  if (sub === 'rank') {
    const { getDb } = await import('../database/db.js');
    const rows = getDb().prepare(`SELECT r.*, p.name FROM pvp_ratings r LEFT JOIN players p ON p.discord_id = r.discord_id ORDER BY elo DESC LIMIT 10`).all();
    if (!rows.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏅 PVP RANKINGS', bodyLines: ['No duels yet. Challenge someone with `/pvp challenge`.'] }));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏅 PVP RANKINGS', bodyLines: rows.map((r, i) => `${i + 1}. **${r.name || r.discord_id}** — ${r.elo} (${r.wins}W/${r.losses}L)`).join('\n').split('\n') }));
  }

  if (sub === 'challenge') {
    const opp = interaction.options.getUser('opponent', true);
    const wait = checkCooldown(me.discord_id, 'pvp_challenge', COOLDOWNS.pvp_challenge);
    if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'pvp_challenge')), ephemeral: true });
    if (!tryBurst(me.discord_id, 'pvp_challenge')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
    try {
      const oppRow = getPlayer(opp.id);
      const gate = canPvp({
        challengerId: me.discord_id, opponentId: oppRow?.discord_id,
        challengerLastAt: getRating(me.discord_id).last_fight_at,
        opponentLastAt: oppRow ? getRating(opp.id).last_fight_at : null,
        challengerToday: fightsToday(me.discord_id),
      });
      if (!gate.ok) return interaction.reply({ ...verr(gate.reason), ephemeral: true });
      createChallenge(me.discord_id, opp.id);
      setCooldown(me.discord_id, 'pvp_challenge', COOLDOWNS.pvp_challenge);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pvp:${me.discord_id}:${opp.id}:accept`).setLabel('Accept').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`pvp:${me.discord_id}:${opp.id}:decline`).setLabel('Decline').setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply(sheet(
        `⚔️ **DUEL CHALLENGE**\n**${me.name} has challenged ${oppRow?.name || opp.username}.** <@${opp.id}> — the Stream waits (10 min).`,
        [row]
      ));
    } finally {
      clearBurst(me.discord_id, 'pvp_challenge');
    }
  }

  if (sub === 'accept') {
    const result = await acceptPending(me.discord_id);
    if (typeof result === 'string') return interaction.reply({ ...verr(result), ephemeral: true });
    return interaction.reply(result);
  }

  const ch = pendingFor(me.discord_id);
  if (!ch) return interaction.reply({ ...verr('No pending duel.'), ephemeral: true });
  resolveChallenge(ch.id, 'declined');
  return interaction.reply(v2declined());
}

function v2declined() {
  return panel({ title: '⚔️ DECLINED', body: 'Duel declined.' });
}

// Shared by /pvp accept and the Accept button — one duel path.
export async function acceptPending(opponentId) {
  const ch = pendingFor(opponentId);
  if (!ch || expired(ch)) {
    if (ch) resolveChallenge(ch.id, 'expired');
    return 'No pending duel.';
  }
  const gate = canPvp({
    challengerId: ch.challenger_id, opponentId: ch.opponent_id,
    challengerLastAt: getRating(ch.challenger_id).last_fight_at,
    opponentLastAt: getRating(ch.opponent_id).last_fight_at,
    challengerToday: fightsToday(ch.challenger_id),
  });
  if (!gate.ok) {
    resolveChallenge(ch.id, 'expired');
    return gate.reason;
  }
  resolveChallenge(ch.id, 'accepted');
  return resolveDuel(ch.challenger_id, ch.opponent_id);
}

export async function handlePvpButton(interaction) {
  const [, challengerId, opponentId, action] = interaction.customId.split(':');
  if (interaction.user.id !== opponentId) {
    return interaction.reply({ ...verr('This duel is not yours to answer.'), ephemeral: true });
  }
  // Burst guard: double-click Accept shouldn't resolve two duels.
  if (action === 'accept' && !tryBurst(opponentId, 'pvp_accept')) {
    return interaction.followUp({ ...verr(burstMessage()), ephemeral: true }).catch(() => null);
  }
  try {
    const me = getPlayer(opponentId);
    if (me) {
      const dead = requireAlive(me);
      if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
    }
    await interaction.update(v2('⚔️ The Stream turns to watch…'));
    if (action === 'decline') {
      const ch = pendingFor(opponentId);
      if (ch) resolveChallenge(ch.id, 'declined');
      return interaction.followUp(v2declined());
    }
    const result = await acceptPending(opponentId);
    if (typeof result === 'string') return interaction.followUp({ ...verr(result), ephemeral: true });
    return interaction.followUp(result);
  } finally {
    if (action === 'accept') clearBurst(opponentId, 'pvp_accept');
  }
}
