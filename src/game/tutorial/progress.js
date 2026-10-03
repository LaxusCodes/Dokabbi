import { getDb } from '../../database/db.js';
import { getPlayer } from '../players/model.js';
import { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { td, sep, sepGap, headerText, V2, LEVELS } from '../../utils/v2.js';

// Interactive first-time tutorial: one lesson at a time, driven by REAL actions.
// Not a separate fake game — status, scenario, combat, daily and profile moves
// advance it. First-time only; /tutorial stays for replay/reference.
// Reward-free by design (no currency, items, XP language here).
export const TOTAL = 8;
// The 'done' marker (index 7) IS completion: the 7th real action (profile)
// lands here, so the 🎉 send-off is reachable. There is no 8th action.
export const DONE_AT = TOTAL - 1;

export const STEPS = [
  { id: 'register', title: 'Choose Your Name', lesson: 'Your name becomes your identity in the Stream.', cta: 'Type:' },
  { id: 'status', title: 'Know Yourself', lesson: 'Every incarnation has a record. Your HP, energy, level, Stories and current condition are tracked there.', cta: 'Try this:' },
  { id: 'scenario_current', title: 'Enter the Scenario', lesson: 'Scenarios are the events that shape your life. Some give you choices. Some reveal hidden paths. Some can permanently change your history.', cta: 'Your next destination:' },
  { id: 'scenario_decide', title: 'Your Choices Matter', lesson: 'The Stream remembers what you choose. Different choices can create different Stories, relationships and future paths.', cta: 'The Stream requires a decision:' },
  { id: 'pve', title: 'Survival', lesson: 'Not every problem can be solved by talking. Combat uses your HP, energy, abilities, probability and allies.', cta: 'Survive your first battle:' },
  { id: 'daily_claim', title: 'Mark the Day', lesson: 'The Stream marks those who return. Come back each day and keep your streak alive.', cta: 'Receive guidance:' },
  { id: 'profile', title: 'Your Legend', lesson: 'Everything you have lived becomes history. History becomes Stories, and Stories change your future.', cta: 'Behold your legend:' },
  { id: 'done', title: 'The Stream Watches', lesson: 'You know enough to survive. The rest you learn by living.', cta: 'Walk on:' },
];

const NEXT_CMD = {
  register: { slash: '/status', prefix: 'status' },
  status: { slash: '/scenario current', prefix: 'scenario' },
  scenario_current: { slash: '/scenario decide', prefix: 'scenario' },
  scenario_decide: { slash: '/pve', prefix: 'pve' },
  pve: { slash: '/daily claim', prefix: 'daily' },
  daily_claim: { slash: '/profile', prefix: 'profile' },
  profile: { slash: '/tutorial', prefix: 'tutorial' },
  done: { slash: '/tutorial', prefix: 'tutorial' },
};

export function getStep(discordId) {
  const p = getPlayer(discordId);
  if (!p) return 0;
  const s = Number(p.tutorial_step ?? 0);
  return Math.max(0, Math.min(TOTAL, s));
}

// Advance when a real action happens. Out-of-order acts still move forward
// (never stuck); returns null when nothing changed or already complete.
export function advanceOn(discordId, action) {
  const idx = STEPS.findIndex((s) => s.id === action);
  if (idx < 0) return null;
  const cur = getStep(discordId);
  if (cur >= DONE_AT) return null;
  const next = Math.max(cur, idx + 1);
  if (next === cur) return null;
  try {
    getDb().prepare('UPDATE players SET tutorial_step = ? WHERE discord_id = ?').run(next, discordId);
  } catch {
    return null;
  }
  return { step: next, done: next >= DONE_AT };
}

export function progressLine(step) {
  if (step >= DONE_AT) return '-# Tutorial complete — the Stream watches what you do.';
  return `-# Tutorial ${Math.min(step + 1, TOTAL)}/${TOTAL}`;
}

// Nudge shown after a step completes: ✅ + titled lesson + varied call to
// action + position. prefix = null → slash style (`/status`); otherwise
// `<prefix> status` style (`orv status`, `*status`, ...). Pass the server's
// real prefix so the tutorial never teaches an interface in use.
export function nudgeFor(action, step, prefix = null) {
  const nxt = NEXT_CMD[action] || NEXT_CMD.done;
  const cmd = prefix ? `${prefix} ${nxt.prefix}` : nxt.slash;
  if (step >= DONE_AT) {
    return `🎉 **Tutorial Complete**\nYou are no longer being introduced to the Stream.\nNow the Stream watches what you do.\n-# Tutorial ${TOTAL}/${TOTAL}`;
  }
  const s = STEPS[Math.min(step, DONE_AT - 1)];
  return `✅ **Step ${step} — ${s.title}**\n\n${s.lesson}\n\n**${s.cta}** \`${cmd}\`\n-# Tutorial ${step}/${TOTAL}`;
}

// Bare-register prompt for the unregistered: step 1.
export function registerPrompt(prefixCmd) {
  return `🌌 **STAR STREAM**\nNew incarnation detected.\n\n**Step 1 — Choose your name**\nYour name will become your identity in the Stream.\n\nType: \`${prefixCmd} register YourName\`\n-# Tutorial 1/${TOTAL}`;
}

// Persistent tutorial message: one initiation thread per incarnation.
// The Begin button stores (channel, message); every later step EDITS that
// same message instead of sending another. No Jump dropdown here — the
// player learns line-by-line.
export function setTutorialMessage(discordId, channelId, messageId) {
  try {
    getDb().prepare('UPDATE players SET tutorial_channel_id = ?, tutorial_msg_id = ? WHERE discord_id = ?')
      .run(channelId || null, messageId || null, discordId);
  } catch { /* onboarding must never break registration */ }
}

// Full payload for the persistent message. Completion carries
// [View Profile][Enter Scenario]; steps carry no components at all.
export function tutorialMessagePayload(step, prefix = null, ownerId = null) {
  if (step >= DONE_AT) {
    const container = new ContainerBuilder().setAccentColor(LEVELS.legendary.accent);
    container.addTextDisplayComponents(td(headerText({ icon: '🎉', kicker: '🌌 STAR STREAM', title: 'Tutorial Complete' })));
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(td(
      'The Stream has explained the rules.\n\nFrom this point onward, nobody tells you what your story will become.\n\nYour choices will.\n\n🌌 The Stream is watching.'
    ));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tutdone:profile:${ownerId || 'x'}`).setLabel('View Profile').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tutdone:scenario:${ownerId || 'x'}`).setLabel('Enter Scenario').setStyle(ButtonStyle.Primary),
    );
    return { components: [container, row], flags: V2 };
  }
  const idx = Math.max(1, Math.min(step, DONE_AT - 1));
  const s = STEPS[idx];
  const cmd = prefix ? `${prefix} ${NEXT_CMD[s.id].prefix}` : NEXT_CMD[s.id].slash;
  const container = new ContainerBuilder().setAccentColor(LEVELS.system.accent);
  container.addTextDisplayComponents(td(`-# 🌌 TUTORIAL • ${idx}/${TOTAL}\n## ${s.title}`));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(`${s.lesson}\n\n**${s.cta}** \`${cmd}\``));
  container.addSeparatorComponents(sepGap());
  container.addTextDisplayComponents(td('[ Tutorial continues when you use the command ]'));
  return { components: [container], flags: V2 };
}

// Rewrite the stored tutorial message to the player's current step.
// Silent no-op when there is nothing to edit (never begun, deleted,
// missing permissions). Returns true when an edit landed.
export async function refreshTutorialMessage(client, discordId, prefix = null) {
  try {
    if (!client) return false;
    const p = getPlayer(discordId);
    const msgId = p?.tutorial_msg_id;
    const chId = p?.tutorial_channel_id;
    if (!msgId || !chId) return false;
    const channel = await client.channels.fetch(chId);
    if (!channel?.messages) return false;
    const msg = await channel.messages.fetch(msgId);
    if (!msg || (client.user && msg.author && msg.author.id !== client.user.id)) return false;
    await msg.edit(tutorialMessagePayload(getStep(discordId), prefix, discordId));
    return true;
  } catch {
    return false;
  }
}

// Single-message rule: the tutorial NEVER sends its own message.
// Call this on the reply payload BEFORE sending; it advances progress and
// appends the ✅ + next-lesson + Tutorial X/8 line into the same container.
// Returns true when this reply now carries tutorial state (caller should
// skip extras like the Jump nav dropdown on guided replies).
export function embedTutorial(payload, discordId, action, prefix = null) {
  let adv = null;
  try {
    adv = advanceOn(discordId, action);
  } catch {
    return false;
  }
  if (!adv) return false;
  const container = payload?.components?.[0];
  if (container && typeof container.addSeparatorComponents === 'function') {
    try {
      container.addSeparatorComponents(sepGap());
      container.addTextDisplayComponents(td(nudgeFor(action, adv.step, prefix)));
    } catch {
      // payload still sends — just without the tutorial line
    }
  }
  return true;
}
