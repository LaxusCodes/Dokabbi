import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

// Central dropdown rails for prefix (`orv ...`) messages.
// Prefix messages are public, so every menu carries its owner's id:
// `scenario:<id>:<owner>`, `orvnav:<owner>`, `orvobs:<owner>`.
// Handlers in src/index.js enforce the owner (strangers get their own copy).

export const NAV_OPTIONS = [
  { label: '📊 status', value: 'status', description: 'Your status window' },
  { label: '📖 scenario', value: 'scenario', description: 'Current scenario + choice menu' },
  { label: '📖 chapter', value: 'chapter', description: 'The open chapter + paths' },
  { label: '🌌 tutorial', value: 'tutorial', description: 'Survival walkthrough' },
  { label: '🎯 daily', value: 'daily', description: "Today's missions" },
  { label: '🎲 encounter', value: 'encounter', description: 'Random encounter' },
  { label: '⚔️ pve', value: 'pve', description: 'Battle a monster' },
  { label: '👁 observe', value: 'observe', description: 'Look for knowledge' },
  { label: '📚 know', value: 'know', description: 'Your knowledge list' },
  { label: '📖 journey', value: 'journey', description: 'Stories + journey cards' },
  { label: '🎴 collection', value: 'collection', description: 'Card collection' },
  { label: '👤 profile', value: 'profile', description: 'Full life record' },
  { label: '⭐ sponsor', value: 'sponsor', description: 'Sponsor contract' },
  { label: '👥 party', value: 'party', description: 'Your party' },
  { label: '🌌 nebula', value: 'nebula', description: 'Your nebula' },
  { label: '👑 titles', value: 'titles', description: 'Earned titles' },
  { label: '📡 stream', value: 'stream', description: 'Server scenario' },
  { label: '🌍 world', value: 'world', description: 'What the server remembers' },
  { label: '🏆 rankings', value: 'rankings', description: 'Top incarnations' },
  { label: '🧬 incarnation', value: 'incarnation', description: 'Life record' },
  { label: '❓ help', value: 'help', description: 'All commands' },
];

export function navRow(ownerId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`orvnav:${ownerId}`)
    .setPlaceholder('Jump to… — pick a command')
    .addOptions(NAV_OPTIONS.slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

export function scenarioChoiceRow(scenarioId, openChoices, ownerId) {
  const opts = openChoices.slice(0, 25).map((v) => ({
    label: v.choice.label.slice(0, 100),
    value: v.choice.id.slice(0, 100),
  }));
  if (!opts.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(ownerId ? `scenario:${scenarioId}:${ownerId}` : `scenario:${scenarioId}`)
    .setPlaceholder('Choose your action')
    .addOptions(opts);
  return new ActionRowBuilder().addComponents(menu);
}

export function observeRow(ownerId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`orvobs:${ownerId}`)
    .setPlaceholder('Observe… — pick where to look')
    .addOptions([
      { label: '🚇 subway', value: 'subway', description: '10 energy' },
      { label: '🚉 station', value: 'station', description: '10 energy' },
    ]);
  return new ActionRowBuilder().addComponents(menu);
}

export function pveMonsterRow(ownerId, monsters) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`orvpve:${ownerId}`)
    .setPlaceholder('Battle… — pick your foe')
    .addOptions(monsters.slice(0, 25).map((m) => ({
      label: (m.name || m.id).slice(0, 100),
      value: m.id.slice(0, 100),
      description: `Tier ${m.tier ?? 1}`,
    })));
  return new ActionRowBuilder().addComponents(menu);
}

// Append the global nav dropdown to any V2 payload. Keeps flags/files.
export function withNav(payload, ownerId) {
  if (!payload || !ownerId) return payload;
  return {
    ...payload,
    components: [...(payload.components || []), navRow(ownerId)],
  };
}

export function ownerOf(customId) {
  const parts = (customId || '').split(':');
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}
