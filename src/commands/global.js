import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { startGlobal, activeGlobal, castVote, votesFor, closeGlobal, pastGlobals, registeredCount } from '../game/scenarios/store.js';
import { resolveGlobal } from '../game/scenarios/global.js';
import { getScenario } from '../game/scenarios/engine.js';
import { globalAnnounce, globalResult, audienceLine, wagerLine } from '../game/starstream/broadcast.js';
import { recordEvent, setFlag, getOrCreateInstance } from '../game/world/store.js';
import { serverStoryCardFor } from '../game/cards/world-cards.js';
import { mintStoryCard } from '../game/cards/mint.js';
import { getDb } from '../database/db.js';
import { addAttention, grantDokjaKnowledge, getDokja } from '../game/canon/store.js';
import { attentionDeltaFor } from '../game/canon/dokja.js';
import { seedConstellationWagers, settleGlobalWagers } from '../game/wagers/store.js';
import { wagerFeedLine, settleFeedLine } from '../game/starstream/audience.js';
import { serverStoryCardFor as underdogCardFor } from '../game/cards/world-cards.js';
import { constellationName } from '../game/constellations/wallets.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { recordGlobalEvent } from '../game/starstream/store.js';
import { scheduleEcho, echoFor } from '../game/world/echoes.js';
import { panel, streamPanel, verr } from '../utils/v2.js';
import { emit } from '../game/events/bus.js';
import scenarios from '../../data/scenarios.json' with { type: 'json' };

export const data = new SlashCommandBuilder()
  .setName('global')
  .setDescription('Server-wide scenario the whole stream decides')
  .addSubcommand((s) =>
    s.setName('start').setDescription('(Admin) open a global vote')
      .addStringOption((o) => o.setName('scenario').setDescription('Scenario id (name: id)').setRequired(true).addChoices(...scenarios.map((s) => ({ name: `${s.id}: ${s.title}`, value: s.id }))))
      .addStringOption((o) => o.setName('a').setDescription('Label for path A').setRequired(true))
      .addStringOption((o) => o.setName('b').setDescription('Label for path B').setRequired(true))
      .addIntegerOption((o) => o.setName('minutes').setDescription('Voting window in minutes (default 45)').setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName('vote').setDescription('Cast your vote').addStringOption((o) => o.setName('choice').setDescription('A or B').setRequired(true))
  )
  .addSubcommand((s) => s.setName('status').setDescription('Show the open vote'))
  .addSubcommand((s) => s.setName('resolve').setDescription('(Admin) close the vote and change the world'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  const admin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (sub === 'start') {
    if (!admin) return interaction.reply({ ...verr('Only server admins can open a global scenario. Try `/global start scenario:001 a:PathA b:PathB`.'), ephemeral: true });
    const scenarioId = interaction.options.getString('scenario', true);
    const sc = getScenario(scenarioId);
    if (!sc) return interaction.reply({ ...verr(`Unknown scenario. Try: ${scenarios.map((s) => s.id).join(', ')}. Try \`/global start scenario:001 a:LabelA b:LabelB\`.`), ephemeral: true });
    try {
      const g = startGlobal(guildId, {
        scenarioId,
        aLabel: interaction.options.getString('a', true),
        bLabel: interaction.options.getString('b', true),
        minutes: interaction.options.getInteger('minutes') || 45,
      });
      getOrCreateInstance(guildId, scenarioId);
      const altered = getDb().prepare('SELECT altered FROM scenario_instances WHERE guild_id = ? AND scenario_id = ?').get(guildId, scenarioId)?.altered;
      const seeds = seedConstellationWagers(guildId, g.id, {});
      const feed = seeds.map((s) => wagerFeedLine({ ...s, display: s.name, aLabel: g.a_label, bLabel: g.b_label })).join('\n');
      await interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [globalAnnounce({ scenarioId, title: sc.title, aLabel: g.a_label, bLabel: g.b_label, participants: registeredCount(), minutes: Math.round((g.ends_at - Date.now()) / 60000), altered: Boolean(altered) }) +
        `\n${audienceLine(registeredCount() * 3, 10 + Math.floor(Math.random() * 20))}\nVote with \`/global vote\`.`
        + (feed ? `\n\n${feed}` : ''),] }));
    } catch (e) {
      return interaction.reply({ ...verr(`${e.message} Try \`/global start scenario:<id> a:LabelA b:LabelB\`.`), ephemeral: true });
    }
    return;
  }

  if (sub === 'vote') {
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ ...verr('Use /register first. Try `/global vote choice:A`.'), ephemeral: true });
    const dead = requireAlive(p);
    if (dead) return interaction.reply({ ...verr(`${dead} Try \`/global vote choice:A\`.`), ephemeral: true });
    const g = activeGlobal(guildId);
    if (!g) return interaction.reply({ ...verr('No global scenario is open. Try `/global start`.'), ephemeral: true });
    const choice = interaction.options.getString('choice', true).toUpperCase();
    try {
      castVote(g.id, p.discord_id, choice);
    } catch (e) {
      return interaction.reply({ ...verr(`${e.message} Try \`/global vote choice:A\`.`), ephemeral: true });
    }
    return interaction.reply({ ...panel({ title: '🗳️ VOTE RECORDED', body: `Your vote for **${choice}** is recorded in the stream.` }), ephemeral: true });
  }

  if (sub === 'status') {
    const g = activeGlobal(guildId);
    if (!g) {
      const past = pastGlobals(guildId, 3);
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌌 GLOBAL', bodyLines: [past.length ? past.map((x) => `Global #${x.id}: ${x.consequence}`).join('\n') : 'No global scenario has ever opened here.'] }));
    }
    const votes = votesFor(g.id);
    const left = Math.max(0, Math.round((g.ends_at - Date.now()) / 60000));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🌌 GLOBAL #${g.id}`, bodyLines: [`A "${g.a_label}" (${votes.filter((v) => v.choice === 'A').length}) vs B "${g.b_label}" (${votes.filter((v) => v.choice === 'B').length})\nTime left: ~${left} min`] }));
  }

  // resolve
  if (!admin) return interaction.reply({ ...verr('Only server admins can resolve a global scenario. Try `/global resolve`.'), ephemeral: true });
  const g = activeGlobal(guildId);
  if (!g) return interaction.reply({ ...verr('No global scenario is open. Try `/global resolve`.'), ephemeral: true });
  const votes = votesFor(g.id);
  const r = resolveGlobal({ scenarioId: g.scenario_id, aLabel: g.a_label, bLabel: g.b_label, votes });
  const db = getDb();
  for (const [k, v] of r.consequence.flags) setFlag(guildId, k, v);
  closeGlobal(g.id, r.consequence.title);
  recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `WORLD EVENT — ${r.consequence.title}. ${r.consequence.text}` });
  const card = serverStoryCardFor({ globalId: g.id, scenarioId: g.scenario_id, name: r.consequence.cardName, participantCount: votes.length, cause: r.consequence.title });
  for (const v of votes) mintStoryCard(db, v.discord_id, card);
  getDokja(guildId);
  addAttention(guildId, attentionDeltaFor('global_resolved'));
  grantDokjaKnowledge(guildId, `global_${g.id}`, 'learned');
  const settled = settleGlobalWagers(guildId, g.id, r.winner);
  const displayOf = (p) => (p.kind === 'constellation' ? constellationName(p.backer_id) : getPlayer(p.backer_id)?.name || p.backer_id);
  const settleLines = settled.payouts.slice(0, 8).map((p) => settleFeedLine({ ...p, display: displayOf(p) }, g.a_label, g.b_label)).join('\n');
  let underdogText = '';
  if (settled.underdog && (r.winner === 'A' || r.winner === 'B')) {
    const ucard = underdogCardFor({ globalId: `${g.id}_underdog`, scenarioId: g.scenario_id, name: '[The Choice Nobody Expected]', participantCount: votes.length, cause: `the outcome contradicted overwhelming expectation (${r.winner === 'A' ? r.pctB : r.pctA}% backed the other path)` });
    const winners = settled.payouts.filter((p) => p.status === 'won' && p.kind === 'player');
    for (const w of winners) mintStoryCard(db, w.backer_id, ucard);
    for (const v of votes) {
      db.prepare('INSERT OR IGNORE INTO player_knowledge (discord_id, knowledge_id, source, scope) VALUES (?,?,?,?)').run(v.discord_id, 'stream_echo', 'global', 'global');
    }
    recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `🎴 NEW SERVER STORY — ${ucard.name}. ${ucard.effect}` });
    recordGlobalEvent({ kind: 'underdog', summary: `🎴 Against all expectation, ${votes.length} incarnations rewrote Global #${g.id}.`, originGuild: guildId });
    for (const w of winners.slice(0, 3)) {
      const uecho = echoFor.underdog(getPlayer(w.backer_id)?.name || 'someone');
      scheduleEcho(guildId, uecho.kind, uecho.summary, uecho.delayMs);
    }
    underdogText = `\n\n🎴 NEW SERVER STORY — **${ucard.name}** (minted to ${winners.length} winning incarnations)`;
  }
  recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `Wagers settled on Global #${g.id}: ${settled.payouts.filter((p) => p.status === 'won').length} won, ${settled.payouts.filter((p) => p.status === 'lost').length} lost.` });
  emit('wager_settled', { guildId, globalId: g.id, winner: r.winner, payouts: settled.payouts.length });
  await interaction.reply(streamPanel({ level: 'important', icon: '⚔️', bodyLines: [globalResult({ title: r.consequence.title, text: r.consequence.text, pctA: r.pctA, pctB: r.pctB, aLabel: g.a_label, bLabel: g.b_label }) +
    `\n\n🎴 Server story card minted to all ${votes.length} voters: **${card.name}**\n-# ${wagerLine()}`
    + (settleLines ? `\n\n${settleLines}` : '') + underdogText,] }));
}
