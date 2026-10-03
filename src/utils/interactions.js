import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { v2, td, V2, sheet } from './v2.js';

// Stateless pagination: all state rides in the customId, nothing in memory.
// customId: pg:<ns>:<page>
export function pageId(ns, page, owner = null) {
  return owner ? `pg:${ns}:${page}:${owner}` : `pg:${ns}:${page}`;
}

export function parsePageId(customId) {
  const m = /^pg:([^:]+):(\d+)(?::(\w+))?$/.exec(customId || '');
  if (!m) return null;
  return { ns: m[1], page: parseInt(m[2], 10), owner: m[3] || null };
}

export function paginate(items, page, perPage = 5) {
  const total = Math.max(1, Math.ceil(items.length / perPage));
  const safe = Math.max(0, Math.min(page, total - 1));
  return { slice: items.slice(safe * perPage, safe * perPage + perPage), page: safe, total };
}

export function pageRow(ns, page, total, owner = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(pageId(ns, page - 1, owner)).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(pageId(ns, page + 1, owner)).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
  );
}

// Destructive actions ask first. Resolves true/false; auto-false on timeout.
export async function askConfirm(interaction, text, timeoutMs = 15000) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm:yes').setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('confirm:no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  const reply = await interaction.reply({ ...sheet(text, [row]), ephemeral: true, fetchReply: true });
  try {
    const pressed = await reply.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('confirm:'),
      time: timeoutMs,
    });
    await pressed.update(sheet(pressed.customId === 'confirm:yes' ? 'Confirmed.' : 'Cancelled.'));
    return pressed.customId === 'confirm:yes';
  } catch {
    await interaction.editReply(sheet('Timed out — nothing happened.')).catch(() => null);
    return false;
  }
}
