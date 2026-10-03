import { SlashCommandBuilder } from 'discord.js';
import { getChannel, topInterests, topReactions, recentGlobalEvents, topGlobalConstellations, serversAblaze, presenceOf, getGlobalInfluence, serversHeat } from '../game/starstream/store.js';
import { anomalyServers } from '../game/canon/divergence.js';
import { presenceView, universeOverview, trendingText, featuredPick } from '../game/starstream/global.js';
import { nebulaServers, allNebulaDefs } from '../game/nebulas/store.js';
import { channelOverview } from '../game/starstream/channel.js';
import { mostWatched, mostDangerousParties, mostActiveConstellations, rankingsText } from '../game/starstream/rankings.js';
import { rewardBonusFor } from '../game/starstream/economy.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { recentEvents } from '../game/world/store.js';
import { constellationName } from '../game/constellations/wallets.js';
import { fameBoard, fameText } from '../game/social/fame.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('starstream')
  .setDescription('The channel that watches you')
  .addSubcommand((s) => s.setName('channel').setDescription('Live channel overview'))
  .addSubcommand((s) => s.setName('rankings').setDescription('Rankings by attention, not level'))
  .addSubcommand((s) => s.setName('universe').setDescription('The global Star Stream above all servers'))
  .addSubcommand((s) => s.setName('global').setDescription('Trending across every server + featured channel'))
  .addSubcommand((s) => s.setName('anomalies').setDescription('Servers where canon is breaking'))
  .addSubcommand((s) => s.setName('fame').setDescription('Many kinds of famous — no single power ladder'))
  .addSubcommand((s) => s.setName('presence').setDescription('Every server a constellation watches').addStringOption((o) => o.setName('constellation').setDescription('Constellation id').setRequired(true)));

const nameOf = (id) => getPlayer(id)?.name || id;

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'universe') {
    const servers = serversAblaze(10);
    const constellations = topGlobalConstellations(5).map((c) => ({ ...c, name: constellationName(c.constellation_id) }));
    const events = recentGlobalEvents(10);
    const nebulas = allNebulaDefs().map((n) => ({ name: n.name, servers: nebulaServers(n.id) }));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [universeOverview({ servers, constellations, events, nebulas })] }));
  }
  if (sub === 'global') {
    const servers = serversHeat(10);
    const featured = featuredPick(servers);
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [trendingText({ servers, events: recentGlobalEvents(5), featured }).slice(0, 3800)] }));
  }
  if (sub === 'anomalies') {
    const rows = anomalyServers(10);
    if (!rows.length) return interaction.reply(streamPanel({ level: 'major', icon: '🚨', title: '⚠️ CANON ANOMALIES', bodyLines: ['No anomalies. Every server still fits the canon — for now.'] }));
    return interaction.reply(streamPanel({ level: 'major', icon: '🚨', title: '⚠️ CANON ANOMALIES', bodyLines: [rows.map((r) => `• Server ${r.guildId} — divergence **${r.score}** (${r.band}): ${r.broken[0]?.actual || 'broken'}`).join('\n')] }));
  }
  if (sub === 'fame') {
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [fameText(fameBoard(guildId)).slice(0, 3800)] }));
  }
  if (sub === 'presence') {
    const id = interaction.options.getString('constellation', true);
    const servers = presenceOf(id);
    if (!servers.length) return interaction.reply({ ...verr('That constellation watches no server yet. Give it a reason.'), ephemeral: true });
    const g = getGlobalInfluence(id);
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [presenceView({ constellationName: constellationName(id), influence: g.influence, renown: g.renown, servers })] }));
  }
  if (sub === 'rankings') {
    const events = recentEvents(guildId, 200);
    const logs = getDb().prepare('SELECT winner_id FROM combat_logs LIMIT 200').all();
    const interests = topInterests(guildId, 5);
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [rankingsText({
      watched: mostWatched(events, nameOf),
      parties: mostDangerousParties(logs, nameOf),
      constellations: mostActiveConstellations(interests, constellationName),
    })] }));
  }
  const ch = getChannel(guildId);
  const interests = topInterests(guildId, 5).map((r) => ({ ...r, name: constellationName(r.constellation_id), views: r.interest * 23 }));
  const db = getDb();
  const openCh = db.prepare(`SELECT chapter_no FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(guildId);
  const branches = openCh ? db.prepare('SELECT COUNT(*) v FROM chapter_branches WHERE guild_id = ? AND chapter_no = ?').get(guildId, openCh.chapter_no).v : 0;
  const trending = recentEvents(guildId, 1)[0]?.summary || null;
  const reactions = topReactions(guildId).map((r) => `${r.reaction}×${r.n}`).join(' ') || 'no reactions yet';
  await interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [channelOverview({ chapterNo: openCh?.chapter_no || 0, branchCount: branches, interests, excitement: ch.excitement, disturbance: ch.disturbance, trending }) +
    `\n\nChannel value: **${ch.channel_value}** (+${rewardBonusFor(ch.channel_value)}% chapter rewards)` +
    `\nAudience: ${reactions}` +
    `\n\n-# Say \`orv help\` or try \`/world stream\` for the live feed.`] }));
}
