import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import { dokjaGreeting, dokjaLine, chooseReaction, attentionDeltaFor } from '../game/canon/dokja.js';
import { getDokja, addAttention, alterCount, dokjaKnows, setDokjaLocation } from '../game/canon/store.js';
import { npcTrustFor, getOrCreateStream, grantKnowledge, playerKnowledgeIds, adjustTrust } from '../game/world/store.js';
import { DOKJA_ID } from '../game/canon/store.js';
import { relationshipState } from '../game/characters/relationships.js';
import { goalsOf } from '../game/characters/goals.js';
import { recentActions, characterLocation } from '../game/characters/actions.js';
import { remember, recall, bumpMemory } from '../game/characters/memory.js';
import { characterCard, revealableInfo } from '../game/characters/cards.js';
import { imageForEntity } from '../utils/images.js';
import { computeDivergence, pressureFor } from '../game/canon/divergence.js';
import { panel, streamPanel, verr, artPanel } from '../utils/v2.js';
import locations from '../../data/locations.json' with { type: 'json' };
import characters from '../../data/characters.json' with { type: 'json' };

const ASKABLE = ['danger_east', 'value_east', 'pattern_lurker'];

export const data = new SlashCommandBuilder()
  .setName('dokja')
  .setDescription('Interact with Kim Dokja, who lives in this world too')
  .addSubcommand((s) => s.setName('look').setDescription('Observe him'))
  .addSubcommand((s) => s.setName('talk').setDescription('Talk to him — he remembers you'))
  .addSubcommand((s) => s.setName('ask').setDescription('Ask about the scenario — he may know what you lack'))
  .addSubcommand((s) => s.setName('hide').setDescription('Hide your knowledge from him (he counts silences)'))
  .addSubcommand((s) => s.setName('card').setDescription('His character card, as known to you'))
  .addSubcommand((s) => s.setName('canon').setDescription('How he compares canon to this timeline'));

function dokjaLocation(guildId) {
  const stream = getOrCreateStream(guildId);
  const loc = locations.find((l) => (l.scenarios || []).includes(stream.current_scenario));
  if (loc) setDokjaLocation(guildId, loc.name);
  return loc?.name || 'Unknown';
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const guildId = interaction.guildId || 'dm';
  const d = getDokja(guildId);
  const location = dokjaLocation(guildId);
  const trust = npcTrustFor(guildId, DOKJA_ID, p.discord_id);
  const alters = alterCount(guildId);
  const state = relationshipState(guildId, DOKJA_ID, p.discord_id);
  const hides = parseInt(recall(guildId, DOKJA_ID, `hides:${p.discord_id}`, '0'), 10) || 0;

  if (sub === 'look') {
    const goals = goalsOf(guildId, DOKJA_ID).filter((g) => g.status === 'active').map((g) => g.goal).join(', ') || 'unknown';
    const last = recentActions(guildId, DOKJA_ID, 1)[0];
    return interaction.reply(streamPanel({
      level: 'system',
      icon: '📖',
      title: '📖 Kim Dokja',
      body: `Location: ${location}\nAttention: ${d.attention}   Relationship to you: **${state}**\nCurrent goal: ${goals}\nAltered events on this server: ${alters}\n${last ? `Last seen: ${last.summary}\n` : ''}\n_${dokjaGreeting(d.attention)}_`,
    }));
  }
  if (sub === 'hide') {
    const attention = addAttention(guildId, attentionDeltaFor('hide'));
    adjustTrust(guildId, DOKJA_ID, p.discord_id, -2);
    bumpMemory(guildId, DOKJA_ID, `hides:${p.discord_id}`);
    return interaction.reply({ ...verr(`You keep your expression empty. Kim Dokja's gaze slides off you — for now. (Attention: ${attention}, trust -2. He counts silences.)`), ephemeral: true });
  }
  if (sub === 'ask') {
    if (['Hostile', 'Enemy'].includes(state)) {
      return interaction.reply({ ...panel({ title: '📖 Kim Dokja', body: dokjaLine('mislead', p.name) }), ephemeral: true });
    }
    const owned = playerKnowledgeIds(p.discord_id);
    const missing = ASKABLE.find((id) => !owned.includes(id) && dokjaKnows(guildId, id));
    addAttention(guildId, attentionDeltaFor('ask'));
    adjustTrust(guildId, DOKJA_ID, p.discord_id, 2);
    if (!missing) return interaction.reply({ ...panel({ title: '📖 Kim Dokja', body: `${dokjaLine('observe', p.name)}\n_He knows nothing you lack — or nothing he will say._` }), ephemeral: true });
    grantKnowledge(p.discord_id, missing, 'dokja');
    return interaction.reply({ ...panel({ title: '📖 Kim Dokja', body: `${dokjaLine(state === 'Trusted' || state === 'Devoted' ? 'assist' : 'warn', p.name)}\n\n👁 Learned: **${missing}** _(check /know list)_` }), ephemeral: true });
  }
  if (sub === 'card') {
    const known = recall(guildId, DOKJA_ID, `investigated:${p.discord_id}`);
    const memories = [
      hides > 0 ? `has hidden things ${hides}x` : null,
      known ? `investigated you: ${known}` : null,
    ].filter(Boolean);
    const interests = alters > 0 ? ['your altered outcomes'] : ['the scenario'];
    const history = recentActions(guildId, DOKJA_ID, 4).map((a) => a.summary);
    const div = computeDivergence(guildId);
    const bar10 = (pct) => '█'.repeat(Math.round(Math.max(0, Math.min(100, pct)) / 10)) + '░'.repeat(10 - Math.round(Math.max(0, Math.min(100, pct)) / 10));
    return interaction.reply({
      ...artPanel({
        title: '🎴 Kim Dokja',
        body: characterCard({ charId: DOKJA_ID, name: 'Kim Dokja', location: characterLocation(guildId, DOKJA_ID), state, knownInfo: revealableInfo(state, memories), affiliations: [], interests, history }) +
          `\n\nCANON MEMORY ${bar10(div.canonMemory)} ${div.canonMemory}%\nACTUAL TIMELINE ${bar10(100)} 100%\nDIVERGENCE ${bar10(div.score)} ${Math.min(100, div.score)}%\n_He has begun comparing what should have happened with what actually happened._`,
        image: imageForEntity(characters.find((c) => c.id === 'kim_dokja')),
      }),
      ephemeral: true,
    });
  }
  if (sub === 'canon') {
    const div = computeDivergence(guildId);
    const pressure = pressureFor(div.band);
    const alteredKnown = ['altered_001', 'altered_002'].filter((k) => dokjaKnows(guildId, k));
    return interaction.reply({
      ...panel({
        title: '📖 Kim Dokja on canon',
        body: `_"${div.band === 'dormant' ? 'So far, so familiar.' : div.broken[0]?.actual || 'Something is wrong here.'}"_\n\nDivergence: **${div.score}** (${div.band}). ${pressure.note}\nContradictions he holds: ${alteredKnown.length ? alteredKnown.join(', ') : 'none yet'}`,
      }),
      ephemeral: true,
    });
  }
  // talk — reaction from history; trust accrues; the Trusted receive aid.
  adjustTrust(guildId, DOKJA_ID, p.discord_id, 1);
  const reaction = chooseReaction({ attention: d.attention, trust: trust + 1, alters });
  let gift = '';
  if ((state === 'Trusted' || state === 'Devoted') && recall(guildId, DOKJA_ID, `gifted:${p.discord_id}`) !== '1') {
    remember(guildId, DOKJA_ID, `gifted:${p.discord_id}`, '1');
    updatePlayer(p.discord_id, { coins: p.coins + 300 });
    gift = '\n🎁 He presses 300 coins into your hand. "For the next impossible thing."';
  }
  return interaction.reply(streamPanel({ level: 'system', icon: '💬', title: '📖 Kim Dokja', body: `${dokjaLine(reaction, p.name)}\n\n_Relationship: ${state}${hides >= 2 ? ' — he remembers your silences' : ''}_${gift}` }));
}
