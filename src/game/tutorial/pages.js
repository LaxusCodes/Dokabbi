import { pageRow } from '../../utils/interactions.js';
import { sheet } from '../../utils/v2.js';

// In-world onboarding: the Stream introduces the player. Content only —
// no tutorial currency, items, XP, combat rules, or database. Stateless:
// every page rides the existing pg:tut:N button rails. Replayable, skippable.
export const PAGES = [
  {
    title: 'New incarnation detected',
    body: '🌌 STAR STREAM\n\nNew incarnation detected.\n\nYour existence has been acknowledged.\n\nBefore your first scenario, the Stream will explain what you need to survive. (8 short pages — dismiss anytime.)',
  },
  {
    title: 'Your Life',
    body: '🧍 **YOUR LIFE**\n\nYou are an incarnation, not an account.\n\nEverything you do becomes history. History becomes Stories. Stories change your future — and follow you through death itself.\n\nSee it: `/incarnation record`',
  },
  {
    title: 'Scenarios',
    body: '📖 **SCENARIOS**\n\nScenarios are where choices have consequences. Read carefully, then decide — the world remembers what you picked, and so do its people.\n\nBegin: `/scenario current` — later, `/chapter current`',
  },
  {
    title: 'Knowledge',
    body: '👁️ **KNOWLEDGE**\n\nInformation is not shared equally. What you know can unlock options others cannot see — and what you share, and with whom, matters.\n\nInvestigate: `/observe` • Your mind: `/know list`',
  },
  {
    title: 'Stories',
    body: '🎴 **STORIES**\n\nImportant actions may become Stories. Stories fight beside you, open sponsors, and outlive you.\n\nYour legend: `/journey` • Your shelf: `/collection`',
  },
  {
    title: 'Sponsors',
    body: '⭐ **SPONSORS**\n\nConstellations watch. Earn attention through scenarios and Stories, and one may eventually offer a contract — with expectations attached.\n\nCheck: `/sponsor status` • `/sponsor offers`',
  },
  {
    title: 'Survival',
    body: '⚔️ **SURVIVAL**\n\nHP, energy, and probability are all real currencies. Parties, companions, and Nebulas multiply you — gambits can end you.\n\nFight: `/pve` • Allies: `/party` • Companion: `/character recruit`',
  },
  {
    title: 'The Star Stream',
    body: '📡 **THE STAR STREAM**\n\nThe Stream watches interesting events. Attention brings wagers, gifts, Dokkaebi commentary — and consequences.\n\nWatch it watch you: `/world stream` • `/starstream channel`\n\n**Your first scenario awaits.** Good luck, incarnation.',
  },
];

export function renderTutorialPage(page, owner = null) {
  const total = PAGES.length;
  const safe = Math.max(0, Math.min(page, total - 1));
  const p = PAGES[safe];
  return {
    ...sheet(`${p.body}\n\n-# Page ${safe + 1}/${total}`, [pageRow('tut', safe, total, owner)]),
    ephemeral: !owner,
  };
}
