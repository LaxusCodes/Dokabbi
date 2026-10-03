import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import {
  createNebula, joinNebula, leaveNebula, memberOf, donate, aid,
  getNebula, nebulaHistory, allRelations, unrevealedAgendas, revealedAgendas, revealAgenda, nebulaLog, allNebulaDefs,
} from '../game/nebulas/store.js';
import { meetsRank, MIN_INVESTIGATE_RANK, AID_COST } from '../game/nebulas/system.js';
import { constellationName } from '../game/constellations/wallets.js';
import { constellationFavor, activeContract } from '../game/sponsors/contracts.js';
import { grantKnowledge } from '../game/world/store.js';
import { getDb } from '../database/db.js';
import { askConfirm } from '../utils/interactions.js';
import { panel, streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('nebula')
  .setDescription('Cosmic factions with agendas')
  .addSubcommand((s) => s.setName('list').setDescription('Known factions of the stream'))
  .addSubcommand((s) => s.setName('create').setDescription('Found your own faction').addStringOption((o) => o.setName('name').setDescription('Nebula name').setRequired(true)))
  .addSubcommand((s) => s.setName('join').setDescription('Swear to a faction').addStringOption((o) => o.setName('id').setDescription('Nebula id').setRequired(true)))
  .addSubcommand((s) => s.setName('leave').setDescription('Walk away (Members+ earn a Story)'))
  .addSubcommand((s) => s.setName('status').setDescription('Your faction, rank, treasury, relations'))
  .addSubcommand((s) => s.setName('politics').setDescription('Faction relations + your three reputations'))
  .addSubcommand((s) => s.setName('donate').setDescription('Feed the treasury (+1 rep per 100)').addIntegerOption((o) => o.setName('amount').setDescription('Coins').setRequired(true)))
  .addSubcommand((s) => s.setName('aid').setDescription(`Emergency full restore (treasury pays ${AID_COST})`))
  .addSubcommand((s) => s.setName('investigate').setDescription('Uncover a hidden agenda (Affiliate+)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';

  if (sub === 'list') {
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌌 FACTIONS OF THE STREAM', bodyLines: [allNebulaDefs().map((n) => `**${n.name}** \`${n.id}\` — *${n.alignment}*\n_${n.description}_\nConstellations: ${(n.constellations || []).map(constellationName).join(', ')}`).join('\n\n')] }));
  }

  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });

  try {
    if (sub === 'create') {
      const m = createNebula(p.discord_id, interaction.options.getString('name', true), guildId);
      return interaction.reply(streamPanel({ level: 'important', icon: '🌌', title: `🌌 ${m.nebula.name}`, bodyLines: ['Rises. You are its first Affiliate.'] }));
    }
    if (sub === 'join') {
      const m = joinNebula(p.discord_id, interaction.options.getString('id', true), guildId);
      // A hostile sponsor's nebula poisons the welcome.
      const c = activeContract(p.discord_id);
      let warn = '';
      if (c) {
        const { nebulaOfConstellation } = await import('../game/nebulas/politics.js');
        const sponsorNeb = nebulaOfConstellation(c.constellation_id, allNebulaDefs());
        if (sponsorNeb && sponsorNeb !== m.nebula_id) {
          const { relationState } = await import('../game/nebulas/store.js');
          if (['Hostile', 'At War'].includes(relationState(guildId, m.nebula_id, sponsorNeb))) {
            const { addFavor } = await import('../game/sponsors/contracts.js');
            addFavor(p.discord_id, c.constellation_id, -10);
            warn = `\n⚠️ Your sponsor's faction is hostile to ${m.nebula.name}. Favor -10.`;
          }
        }
      }
      return interaction.reply(streamPanel({ level: 'important', icon: '🌌', title: `🌌 SWORN TO ${m.nebula.name}`, bodyLines: [`Rank: ${m.rank}.${warn}`] }));
    }
    if (sub === 'leave') {
      if (!await askConfirm(interaction, 'Walk away from your nebula? Standing resets; high rank earns a parting Story.')) return;
      const story = leaveNebula(p.discord_id, guildId);
      return interaction.followUp(panel({ title: '🌌 DEPARTED', body: `You walk away.${story}` }));
    }
    if (sub === 'donate') {
      const rep = donate(p.discord_id, interaction.options.getInteger('amount', true), guildId);
      return interaction.reply(panel({ title: '🌌 DONATED', body: `Your standing rises (rep ${rep}).` }));
    }
    if (sub === 'aid') {
      aid(p.discord_id, guildId);
      return interaction.reply(panel({ title: '🌌 EMERGENCY AID', body: 'Restored to full. The treasury remembers.' }));
    }
    if (sub === 'investigate') {
      const m = memberOf(p.discord_id, guildId);
      if (!m) throw new Error('Sworn to no nebula.');
      if (!meetsRank(m.reputation, MIN_INVESTIGATE_RANK)) throw new Error(`Agenda-hunting requires rank ${MIN_INVESTIGATE_RANK}+ (you are ${m.rank}).`);
      if (p.energy < 20) throw new Error('Too exhausted (need 20 energy).');
      const agenda = revealAgenda(guildId, m.nebula_id, p.discord_id);
      if (!agenda) return interaction.reply({ ...verr('No secrets left in this faction. Suspicious in itself.'), ephemeral: true });
      updatePlayer(p.discord_id, { energy: p.energy - 20 });
      const kid = `agenda_${m.nebula_id}_${agenda.id}`;
      grantKnowledge(p.discord_id, kid, 'investigate');
      nebulaLog(guildId, m.nebula_id, 'secret', `${p.name} uncovered: ${agenda.title}.`);
      return interaction.reply({
        ...streamPanel({ level: 'major', icon: '🕵️', title: `🕵️ ${agenda.title}`, bodyLines: [`${agenda.body}\n\n-# Recorded as Knowledge (private until you share it).`] }),
        ephemeral: true,
      });
    }
    if (sub === 'politics') {
      const m = memberOf(p.discord_id, guildId);
      const c = activeContract(p.discord_id);
      const top = getDb().prepare('SELECT constellation_id, favor FROM constellation_favor WHERE discord_id = ? ORDER BY favor DESC LIMIT 1').get(p.discord_id);
      const lines = allNebulaDefs().map((n) => {
        const rels = allRelations(guildId, n.id).map((r) => `${r.name}: ${r.state}`).join('; ');
        return `**${n.name}** — ${rels}`;
      });
      const personal = p.scenario_progress * 2 + p.level;
      const nebRep = m ? `${m.nebula.name}: ${m.reputation} (${m.rank})` : 'sworn to none';
      const favorLine = top ? `highest favor ${constellationName(top.constellation_id)} (${top.favor})` : 'no constellation favor yet';
      const sponsorLine = c ? `Sponsored by ${constellationName(c.constellation_id)}` : 'no sponsor';
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏛️ FACTION RELATIONS', bodyLines: [`${lines.join('\n')}\n\n__Your three reputations__\nPersonal: ${personal}\nConstellation: ${sponsorLine}; ${favorLine}\nNebula: ${nebRep}`] }));
    }
    // status
    const m = memberOf(p.discord_id, guildId);
    if (!m) return interaction.reply({ ...verr('Sworn to no nebula. See `/nebula list`.'), ephemeral: true });
    const neb = getNebula(m.nebula_id);
    const roster = (neb.def?.constellations || []).map(constellationName).join(', ') || 'no constellations yet';
    const rels = allRelations(guildId, m.nebula_id).map((r) => `${r.name}: ${r.state}`).join(' • ') || 'no known rivals';
    const secrets = revealedAgendas(guildId, m.nebula_id);
    const hidden = unrevealedAgendas(guildId, m.nebula_id).length;
    const hist = nebulaHistory(m.nebula_id, 5).map((h) => `• ${h.summary}`).join('\n') || '_No history._';
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🌌 ${neb.name} — ${m.rank} (rep ${m.reputation})`, bodyLines: [`Treasury: ${neb.treasury} coins • Members: ${neb.members.length}\nConstellations: ${roster}\nRelations: ${rels}\nSecrets uncovered: ${secrets.length} (${hidden} hidden)${secrets.length ? `\n${secrets.map((s) => `🕵️ ${s.title}`).join('\n')}` : ''}\n\n__Recent__\n${hist}`] }));
  } catch (e) {
    if (interaction.replied) return interaction.followUp({ ...verr(e.message), ephemeral: true });
    return interaction.reply({ ...verr(e.message), ephemeral: true });
  }
}
