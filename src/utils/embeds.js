import { ContainerBuilder } from 'discord.js';
import { artPanel, ACCENT, V2, td, v2 } from './v2.js';
import { imageForEntity } from './images.js';
import characters from '../../data/characters.json' with { type: 'json' };

export function statusEmbed(p, extra = {}) {
  const bar = (v, max, w = 10) => {
    const pct = Math.max(0, Math.min(100, Math.round((v / max) * 100)));
    const full = Math.round((pct / 100) * w);
    return `${'█'.repeat(full)}${'░'.repeat(w - full)} ${pct}%`;
  };
  const s = extra.sentiment || { favorable: 0, hostile: 0 };
  const sentiment = (s.favorable === 0 && s.hostile === 0)
    ? 'Neutral • No constellation has taken interest yet'
    : [
        s.favorable > 0 ? `👍 Favorable • ${s.favorable} watching` : null,
        s.hostile > 0 ? `👎 Hostile • ${s.hostile} watching` : null,
      ].filter(Boolean).join('\n');
  const sc = extra.next || null;
  const scenario = (p.scenario_progress || 0) === 0
    ? 'None — awaiting Scenario 001'
    : (sc ? `Scenario ${sc.id} — ${sc.title}` : 'Caught up with the stream');
  const image = imageForEntity(p);
  return artPanel({
    title: `📊 ${p.name} — *${p.title}*`,
    body: [
      `Lv **${p.level}** • ${p.status || 'alive'}`,
      ``,
      `❤️ HP ${bar(p.hp, p.max_hp)}`,
      `⚡ Energy ${bar(p.energy, p.max_energy)}`,
      ``,
      `💰 **${p.coins}** Coins   🎲 Probability **${p.probability}**`,
      ``,
      `STR ${p.str} • AGI ${p.agi} • VIT ${p.vit} • MAG ${p.mag} • INT ${p.intel}`,
      ``,
      `⭐ Sponsor: ${p.sponsor_id || 'None'}`,
      `🌌 Constellation Sentiment`,
      sentiment,
      `📖 Current Scenario`,
      scenario,
      ``,
      `☠️ ${p.deaths || 0} deaths • ♻️ ${p.rebirths || 0} rebirths`,
      `🌌 Star Stream`,
      `-# /profile — view your complete life`,
    ].join('\n'),
    image,
  });
}

export function broadcastComponents(lines) {
  return [new ContainerBuilder().setAccentColor(ACCENT.purple).addTextDisplayComponents(td(`📡 STAR STREAM\n${lines.map((l) => `[${l}]`).join('\n')}`))];
}

export function broadcastEmbed(lines) {
  return { components: broadcastComponents(lines), flags: V2 };
}

export { v2 };
