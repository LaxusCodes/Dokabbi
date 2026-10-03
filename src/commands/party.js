import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { ROLES } from '../game/combat/engine.js';
import { formationBonus, roleSynergy } from '../game/parties/system.js';
import { createParty, joinParty, leaveParty, getPlayerParty, setMemberRole } from '../game/parties/store.js';
import { askConfirm } from '../utils/interactions.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('party')
  .setDescription('Party actions (2–5 incarnations)')
  .addSubcommand((s) => s.setName('create').setDescription('Found a party').addStringOption((o) => o.setName('name').setDescription('Party name').setRequired(true)))
  .addSubcommand((s) => s.setName('join').setDescription('Join a party').addStringOption((o) => o.setName('id').setDescription('Party id from /party status').setRequired(true)))
  .addSubcommand((s) => s.setName('leave').setDescription('Leave your party'))
  .addSubcommand((s) => s.setName('status').setDescription('Show your party'))
  .addSubcommand((s) =>
    s.setName('role').setDescription('Set your combat role').addStringOption((o) => o.setName('role').setDescription(ROLES.join(', ')).setRequired(true))
  );

function describe(group) {
  if (!group) return 'No party. Create one with `/party create`.';
  const { party, members } = group;
  const form = formationBonus(members);
  const syn = roleSynergy(members);
  const lines = members.map((m) => `• **${m.name}** (Lv ${m.level}) — ${m.role}`);
  return `**${party.name}** \`[${party.id}]\` — ${members.length}/5\n${lines.join('\n')}\n-# ${form.name} +${form.bonusPct}%${syn.parts.length ? ` • ${syn.parts.join(', ')}` : ''}`;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const me = getPlayer(interaction.user.id);
  if (!me) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  try {
    if (sub === 'create') {
      const g = createParty(me.discord_id, interaction.options.getString('name', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '👥 PARTY FORMED', bodyLines: describe(g).split('\n') }));
    }
    if (sub === 'join') {
      const g = joinParty(me.discord_id, interaction.options.getString('id', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '👥 JOINED', bodyLines: describe(g).split('\n') }));
    }
    if (sub === 'leave') {
      if (!await askConfirm(interaction, 'Leave your party? Your team card keeps the history.')) return;
      const g = leaveParty(me.discord_id);
      return interaction.followUp(streamPanel({ level: 'system', icon: '🌌', title: '👥 LEFT', bodyLines: (g ? describe(g) : 'The party disbanded.').split('\n') }));
    }
    if (sub === 'role') {
      const g = setMemberRole(me.discord_id, interaction.options.getString('role', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '👥 ROLE UPDATED', bodyLines: describe(g).split('\n') }));
    }
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '👥 PARTY', bodyLines: describe(getPlayerParty(me.discord_id)).split('\n') }));
  } catch (e) {
    if (interaction.replied) return interaction.followUp({ ...verr(e.message), ephemeral: true });
    return interaction.reply({ ...verr(e.message), ephemeral: true });
  }
}
