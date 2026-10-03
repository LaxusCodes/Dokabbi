import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { playerKnowledge, setKnowledgeScope, recordEvent } from '../game/world/store.js';
import { recordGlobalEvent } from '../game/starstream/store.js';
import { emit } from '../game/events/bus.js';
import { visibleKnowledgeOf } from '../game/knowledge/permissions.js';
import { getDb } from '../database/db.js';
import { validateShareScope, SCOPE_LABELS } from '../game/knowledge/system.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { worldEventSummary } from '../game/world/memory.js';
import { panel, verr } from '../utils/v2.js';
import knowledge from '../../data/knowledge.json' with { type: 'json' };

const titleOf = (id) => knowledge.find((k) => k.id === id)?.title || id;

export const data = new SlashCommandBuilder()
  .setName('know')
  .setDescription('Your knowledge — and who you share it with')
  .addSubcommand((s) => s.setName('list').setDescription('What you know'))
  .addSubcommand((s) => s.setName('inspect').setDescription('What another incarnation shares with you').addUserOption((o) => o.setName('who').setDescription('Whose shared knowledge').setRequired(true)))
  .addSubcommand((s) =>
    s
      .setName('share')
      .setDescription('Share information (or keep it to yourself)')
      .addStringOption((o) => o.setName('id').setDescription('Knowledge id from /know list').setRequired(true))
      .addStringOption((o) => o.setName('scope').setDescription('party, player, nebula, public, private').setRequired(true))
      .addUserOption((o) => o.setName('target').setDescription('Required for scope: player'))
  );

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') {
    const rows = playerKnowledge(p.discord_id);
    if (!rows.length) return interaction.reply({ ...panel({ title: '📚 KNOWLEDGE', body: 'You know nothing the stream cares about — yet. Try /observe.' }), ephemeral: true });
    return interaction.reply({
      ...panel({ title: '📚 KNOWLEDGE', body: rows.map((r) => `• \`${r.knowledge_id}\` — ${titleOf(r.knowledge_id)} _(shared with: ${SCOPE_LABELS[r.scope] || r.scope})_`).join('\n') }),
      ephemeral: true,
    });
  }
  if (sub === 'inspect') {
    const who = interaction.options.getUser('who', true);
    const rows = visibleKnowledgeOf(p.discord_id, who.id, interaction.guildId || 'dm');
    if (!rows.length) return interaction.reply({ ...verr('They share nothing with you. Secrets stay secret.'), ephemeral: true });
    return interaction.reply({
      ...panel({ title: `📚 What ${who.username} shares with you`, body: rows.map((r) => `• \`${r.knowledge_id}\` — ${titleOf(r.knowledge_id)}`).join('\n') }),
      ephemeral: true,
    });
  }
  const id = interaction.options.getString('id', true);
  const scope = validateShareScope(interaction.options.getString('scope', true));
  const target = interaction.options.getUser('target');
  if (scope === 'player' && !target) return interaction.reply({ ...verr('Scope "player" needs a target incarnation.'), ephemeral: true });
  if (scope === 'global' && !knowledge.find((k) => k.id === id)?.global) {
    return interaction.reply({ ...verr('GLOBAL is nearly impossible — only echoes of probability-breaking events can cross servers.'), ephemeral: true });
  }
  const wait = checkCooldown(p.discord_id, 'know_share', COOLDOWNS.know_share);
  if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'know_share')), ephemeral: true });
  if (!tryBurst(p.discord_id, 'know_share')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
  try {
    try {
      setKnowledgeScope(p.discord_id, id, scope);
      if (scope === 'player') getDb().prepare('UPDATE player_knowledge SET shared_with = ? WHERE discord_id = ? AND knowledge_id = ?').run(target.id, p.discord_id, id);
      else getDb().prepare('UPDATE player_knowledge SET shared_with = NULL WHERE discord_id = ? AND knowledge_id = ?').run(p.discord_id, id);
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
    if (scope === 'public' && interaction.guildId) {
      recordEvent(interaction.guildId, {
        kind: 'knowledge_shared', actorId: p.discord_id,
        summary: worldEventSummary('knowledge_shared', p.name, `the Star Stream (${titleOf(id)})`),
      });
      emit('knowledge_shared', { guildId: interaction.guildId, playerId: p.discord_id, knowledgeId: id, scope });
    }
    if (scope === 'global' && interaction.guildId) {
      recordGlobalEvent({ kind: 'knowledge', summary: `📡 ${p.name} broadcast ${titleOf(id)} to EVERY server. The Stream carries it.`, originGuild: interaction.guildId });
    }
    setCooldown(p.discord_id, 'know_share', COOLDOWNS.know_share);
    return interaction.reply({ ...panel({ title: '📚 SHARED', body: `**${titleOf(id)}** will now be shared with: **${SCOPE_LABELS[scope]}**.` }), ephemeral: true });
  } finally {
    clearBurst(p.discord_id, 'know_share');
  }
}
