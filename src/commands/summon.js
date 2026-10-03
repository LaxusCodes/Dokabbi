import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { rollRarity } from '../game/cards/system.js';
import { imageForEntity } from '../utils/images.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { artPanel, verr } from '../utils/v2.js';
import cards from '../../data/cards.json' with { type: 'json' };

export const data = new SlashCommandBuilder().setName('summon').setDescription('Draw a card from the stream (costs 200 coins)');

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply(verr('Use /register first.', { ephemeral: true }));
  const wait = checkCooldown(p.discord_id, 'summon', COOLDOWNS.summon);
  if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'summon')), ephemeral: true });
  if (!tryBurst(p.discord_id, 'summon')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
  try {
    if (p.coins < 200) return interaction.reply(verr('Need 200 coins.', { ephemeral: true }));
    const { updatePlayer } = await import('../game/players/model.js');
    const { getDb } = await import('../database/db.js');
    const rarity = rollRarity();
    const pool = cards.filter((c) => c.rarity === rarity);
    const card = (pool.length ? pool : cards)[Math.floor(Math.random() * (pool.length ? pool.length : cards.length))];
    updatePlayer(p.discord_id, { coins: p.coins - 200 });
    getDb().prepare('INSERT INTO player_cards (discord_id, card_id, qty) VALUES (?,?,1) ON CONFLICT(discord_id,card_id) DO UPDATE SET qty=qty+1').run(p.discord_id, card.id);
    setCooldown(p.discord_id, 'summon', COOLDOWNS.summon);
    await interaction.reply(artPanel({
      title: `🎴 Summoned ${card.name}!`,
      body: `[${card.rarity}] • power ${card.power}\n-# The Stream provides.`,
      image: imageForEntity(card),
    }));
  } finally {
    clearBurst(p.discord_id, 'summon');
  }
}
