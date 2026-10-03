import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { SPONSOR_CATALOG, evaluateEligibility } from '../game/sponsors/eligibility.js';
import { offerText, interestBar } from '../game/sponsors/offers.js';
import { describeExpectation, evaluateExpectation } from '../game/sponsors/expectations.js';
import {
  gatherSignals, constellationFavor, activeContract, pendingOffers,
  acceptOffer, declineOffer, breakContract, negotiateOffer, expectationsOf, loyaltyOf, completedCount,
} from '../game/sponsors/contracts.js';
import { constellationName, getWallet } from '../game/constellations/wallets.js';
import { askConfirm } from '../utils/interactions.js';
import { panel, streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('sponsor')
  .setDescription('Sponsorships are earned, not shopped for')
  .addSubcommand((s) => s.setName('status').setDescription('Your contract, loyalty and favor'))
  .addSubcommand((s) => s.setName('offers').setDescription('Constellations considering you'))
  .addSubcommand((s) => s.setName('inspect').setDescription('What a constellation demands of you').addStringOption((o) => o.setName('constellation').setDescription('e.g. judge_embers').setRequired(true)))
  .addSubcommand((s) => s.setName('accept').setDescription('Sign a pending offer').addIntegerOption((o) => o.setName('offer').setDescription('Offer id').setRequired(true)))
  .addSubcommand((s) => s.setName('decline').setDescription('Refuse a pending offer').addIntegerOption((o) => o.setName('offer').setDescription('Offer id').setRequired(true)))
  .addSubcommand((s) => s.setName('negotiate').setDescription('Bargain terms: coins, duration, requirement')
    .addIntegerOption((o) => o.setName('offer').setDescription('Offer id').setRequired(true))
    .addStringOption((o) => o.setName('term').setDescription('coins, duration, requirement').setRequired(true)))
  .addSubcommand((s) => s.setName('expectations').setDescription('Your live expectation progress'))
  .addSubcommand((s) => s.setName('break').setDescription('Break your contract (favor -20)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const guildId = interaction.guildId || 'dm';

  if (sub === 'status') {
    const c = activeContract(p.discord_id);
    if (!c) {
      const offers = pendingOffers(p.discord_id);
      return interaction.reply({
        ...verr(offers.length ? `No contract. **${offers.length} constellation(s)** are considering you — see \`/sponsor offers\`.` : 'No contract, no offers. Survive scenarios; the stars are watching.'),
        ephemeral: true,
      });
    }
    const favor = constellationFavor(p.discord_id, c.constellation_id);
    const tier = loyaltyOf(p.discord_id, c.constellation_id);
    const exps = expectationsOf(c.id).map((e) => `• ${describeExpectation(e.type, e.required)} — ${e.progress}/${e.required} [${e.status}]`).join('\n');
    return interaction.reply(streamPanel({ level: 'system', icon: '⭐', title: `⭐ ${constellationName(c.constellation_id)}`, bodyLines: [`Loyalty: **${tier}** (favor ${favor})\nContract #${c.id}: ${c.scenarios_done}/${c.duration} scenarios\n${exps}`] }));
  }

  if (sub === 'offers') {
    const offers = pendingOffers(p.discord_id);
    if (!offers.length) return interaction.reply({ ...verr('No offers. Earn attention first: clear scenarios, build Stories, defy fate.'), ephemeral: true });
    return interaction.reply({
      ...streamPanel({ level: 'system', icon: '⭐', title: '⭐ SPONSORSHIP OFFERS', bodyLines: [offers.map((o) => {
        const favor = constellationFavor(p.discord_id, o.constellation_id);
        return `\`#${o.id}\` **${constellationName(o.constellation_id)}** — interest ${interestBar(favor)} ${favor}\n${offerText({ constellationName: constellationName(o.constellation_id), coins: o.coins, stigma: o.stigma, expectationType: o.expectation_type, expectationRequired: o.expectation_required, duration: o.duration })}${o.conflict ? '\n⚠️ Their expectations conflict with another offer. Your decision will affect both relationships.' : ''}`;
      }).join('\n\n')] }),
      ephemeral: true,
    });
  }

  if (sub === 'inspect') {
    const id = interaction.options.getString('constellation', true);
    if (!SPONSOR_CATALOG[id]) return interaction.reply({ ...verr(`Unknown. Try: ${Object.keys(SPONSOR_CATALOG).join(', ')}`), ephemeral: true });
    const signals = gatherSignals(p.discord_id);
    const { eligible, checks } = evaluateEligibility(id, {
      clears: signals.clears, favor: constellationFavor(p.discord_id, id), stories: signals.stories,
      signals, hasContract: Boolean(activeContract(p.discord_id)), influence: getWallet(guildId, id)?.influence || 0,
    });
    return interaction.reply({
      ...streamPanel({ level: 'system', icon: '⭐', title: `⭐ ${constellationName(id)}`, bodyLines: [`${eligible ? '**would consider you** (finish another scenario to trigger the offer)' : 'not yet'}\n${checks.map((c) => `${c.met ? '✓' : '○'} ${c.label}`).join('\n')}`] }),
      ephemeral: true,
    });
  }

  if (sub === 'accept') {
    try {
      const { contractId, card } = acceptOffer(interaction.options.getInteger('offer', true), p.discord_id, guildId);
      return interaction.reply(panel({
        title: `📜 Contract #${contractId} signed`,
        body: `The stigma is yours.\n🎴 Story card: **${card.name}**\n📖 Kim Dokja's attention has increased.`,
      }));
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }

  if (sub === 'decline') {
    try {
      declineOffer(interaction.options.getInteger('offer', true), p.discord_id, guildId);
      return interaction.reply({ ...verr('Offer declined. The constellation will remember the slight (favor -5).'), ephemeral: true });
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }

  if (sub === 'negotiate') {
    try {
      const res = negotiateOffer(interaction.options.getInteger('offer', true), p.discord_id, interaction.options.getString('term', true));
      return interaction.reply({ ...panel({ title: '🤝 NEGOTIATION', body: res.response }), ephemeral: true });
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }

  if (sub === 'expectations') {
    const c = activeContract(p.discord_id);
    if (!c) return interaction.reply({ ...verr('No active contract.'), ephemeral: true });
    const signals = gatherSignals(p.discord_id);
    const lines = expectationsOf(c.id).map((e) => {
      const prog = evaluateExpectation(e.type, signals, e.required);
      return `• ${describeExpectation(e.type, e.required)} — **${prog}/${e.required}** [${e.status}]`;
    });
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `📡 SPONSOR — ${constellationName(c.constellation_id)}`, bodyLines: [`${lines.join('\n')}\nCompleted before: ${completedCount(p.discord_id, c.constellation_id)}`] }));
  }

  try {
    if (!await askConfirm(interaction, '💔 Break your sponsorship? Favor -20, and the stars do not forget.')) return;
    breakContract(p.discord_id, guildId);
    return interaction.followUp(panel({ title: '💔 CONTRACT BROKEN', body: 'Favor -20. The stars do not forget, but they may forgive.' }));
  } catch (e) {
    if (!interaction.replied) return interaction.reply({ ...verr(e.message), ephemeral: true });
    return interaction.followUp({ ...verr(e.message), ephemeral: true });
  }
}
