import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder } from 'discord.js';

// Components V2 kit. Every Discord-visible message goes through here:
// V2 payloads MUST NOT mix `content` or `embeds` — components only.
//
// Visual identity: dark Stream panels, one strong icon per section,
// hierarchy via kicker → title → body → progress → reward → action.
// Normal responses stay clean; rare events get dramatic accents.
export const V2 = MessageFlags.IsComponentsV2;

export const ACCENT = {
  info: 0x5865f2,
  stream: 0x5865f2,
  important: 0x9b59b6,
  major: 0xff5555,
  legendary: 0xffd166,
  gold: 0xffd166,
  green: 0x57f287,
  red: 0xff5555,
  purple: 0x9b59b6,
};

// LEVEL 1 System — normal info. LEVEL 2 Important — scenarios/choices/combat.
// LEVEL 3 Major — rare Stories, death, anomalies. LEVEL 4 Legendary — extraordinary.
export const LEVELS = {
  system: { accent: 0x5865f2, kicker: '🌌 STAR STREAM' },
  important: { accent: 0x9b59b6, kicker: null },
  major: { accent: 0xff5555, kicker: '🚨 PROBABILITY DISTURBANCE' },
  legendary: { accent: 0xffd166, kicker: '✦ THE STREAM HAS LOOKED TWICE ✦' },
};

export function td(text) {
  return new TextDisplayBuilder().setContent(String(text).slice(0, 4000));
}

// Plain rich-text message — still a container, so every reply carries
// the Stream's accent bar instead of falling back to flat text.
export function v2(text, extra = {}) {
  return {
    components: [new ContainerBuilder().setAccentColor(ACCENT.info).addTextDisplayComponents(td(text))],
    flags: V2,
    ...extra,
  };
}

// Text panel plus interactive rows (buttons, selects) underneath.
export function sheet(text, rows = []) {
  return { components: [...panel({ body: text }).components, ...rows], flags: V2 };
}

// Titled panel. extra.components appends rows (buttons, selects) after the panel.
export function panel({ title = null, body = '', accent = ACCENT.info, components = [] }) {
  const text = title ? `**${title}**\n${body}` : body;
  const container = new ContainerBuilder().setAccentColor(accent).addTextDisplayComponents(td(text));
  return { components: [container, ...components], flags: V2 };
}

export function verr(text, extra = {}) {
  return { components: [new ContainerBuilder().setAccentColor(ACCENT.red).addTextDisplayComponents(td(text))], flags: V2, ...extra };
}

export function sep() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);
}

export function sepGap() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false);
}

// One strong icon per section: kicker (small) → title (large).
export function headerText({ icon = '🌌', kicker = null, title = '' }) {
  const kick = kicker ? `-# ${kicker}\n` : '';
  return `${kick}## ${icon} ${title}`.slice(0, 4000);
}

// Section with a button accessory — compact header + action in one row.
export function sectionWithButton(text, button) {
  return new SectionBuilder().addTextDisplayComponents(td(text)).setButtonAccessory(button);
}

export function claimRow(customId = 'daily:claim', label = 'Claim Daily Reward') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary)
  );
}

export function beginTutorialRow(owner = null, src = 'slash') {
  const tag = String(src || 'slash').replace(/:/g, '').slice(0, 5) || 'slash';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(owner ? `stream:tutorial:${owner}:${tag}` : 'stream:tutorial')
      .setLabel('Begin Tutorial')
      .setStyle(ButtonStyle.Primary)
  );
}

// Core Stream panel: Container with structured hierarchy.
// bodyLines are plain rows (use ○/●, no emoji per line).
export function streamPanel({ level = 'system', icon = '🌌', kicker, title = '', bodyLines = [], footer = null, accent = null }) {
  const lv = LEVELS[level] || LEVELS.system;
  const container = new ContainerBuilder().setAccentColor(accent ?? lv.accent);
  container.addTextDisplayComponents(td(headerText({ icon, kicker: kicker ?? lv.kicker, title })));
  if (bodyLines.length) {
    container.addSeparatorComponents(sep());
    container.addTextDisplayComponents(td(bodyLines.join('\n')));
  }
  if (footer) {
    container.addSeparatorComponents(sepGap());
    container.addTextDisplayComponents(td(footer));
  }
  return { components: [container], flags: V2 };
}

// Daily scenario panel: main objective → progress → reward → action.
export function dailyPanel({ missions = [], streak = 0, checkin = false, rewardText = '🪙 Coins  •  ⚡ Energy  •  ✦ Favor' }) {
  const total = missions.length || 4;
  const done = missions.filter((m) => m.done).length;
  const rows = missions.map((m) => `${m.done ? '●' : '○'} ${m.text}`);
  const container = new ContainerBuilder().setAccentColor(LEVELS.system.accent);
  container.addTextDisplayComponents(td(headerText({ icon: '🌌', kicker: '🌌 STAR STREAM', title: "Today's Scenario" })));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(rows.join('\n') || '○ No contracts today'));
  container.addSeparatorComponents(sep());
  const state = checkin ? 'Checked in' : 'Not checked in';
  container.addTextDisplayComponents(td(`Progress: **${done} / ${total}**\n-# Streak **${streak}** • ${state}`));
  container.addSeparatorComponents(sepGap());
  container.addTextDisplayComponents(td(`Reward\n${rewardText}`));
  return { components: [container], flags: V2 };
}

// Registration event panel: the premium first impression. Enough context for
// a new player (what an incarnation is, what coins mean, what to do next)
// without a lore dump. prefix = null → slash commands in the journey list,
// otherwise the server's real prefix (`orv status`, `*status`, ...).
export function registerPanel({ name = 'Incarnation', coins = 100, prefix = null }) {
  const cmd = (slash, bare) => (prefix ? `${prefix} ${bare}` : slash);
  const clean = String(name).slice(0, 32);
  const container = new ContainerBuilder().setAccentColor(LEVELS.system.accent);
  container.addTextDisplayComponents(td(headerText({ icon: '🌌', kicker: '🌌 STAR STREAM', title: 'New Incarnation Detected' })));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(`**${clean} has entered the Stream.**`));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(
    `▸ Name\n**${clean}**\n\n▸ Status\nAlive • Newly Registered\n\n▸ Starting Resources\n🪙 **${coins}** Stream Coins — spent on summons, wagers and survival`
  ));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(
    `**What is an Incarnation?**\nYou are a person living inside the Stream. Your choices, victories, failures and relationships become your history.\n\n**What happens next?**\nYour first Scenario will introduce you to the rules of survival.`
  ));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(
    `**Your First Hours**\n1  Register your incarnation  ✅\n2  Learn your status  →  \`${cmd('/status', 'status')}\`\n3  Enter Scenario 001  →  \`${cmd('/scenario current', 'scenario')}\`\n4  Make your first decision  →  \`${cmd('/scenario decide', 'scenario')}\`\n5  Survive your first encounter  →  \`${cmd('/pve', 'pve')}\`\n6  Claim today's guidance  →  \`${cmd('/daily', 'daily')}\``
  ));
  container.addSeparatorComponents(sepGap());
  container.addTextDisplayComponents(td('The Stream is watching.'));
  return { components: [container], flags: V2 };
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// Image panel: remote URL streams, local file attaches, generated cards,
// missing art degrades to text (never breaks a reply).
export function artPanel({ title = null, body = '', image = null, accent = ACCENT.purple }) {
  const text = title ? `**${title}**\n${body}` : body;
  const container = new ContainerBuilder().setAccentColor(accent).addTextDisplayComponents(td(text));
  if (!image) return { components: [container], flags: V2 };
  if (image instanceof Buffer) {
    const name = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const attachment = new AttachmentBuilder(image, { name });
    container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
    return { components: [container], flags: V2, files: [attachment] };
  }
  if (/^https?:\/\//i.test(image)) {
    const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image));
    return { components: [container, gallery], flags: V2 };
  }
  const file = path.isAbsolute(image) ? image : path.join(process.cwd(), image);
  if (!IMAGE_EXTS.has(path.extname(file).toLowerCase()) || !fs.existsSync(file)) {
    return { components: [container], flags: V2 };
  }
  const name = path.basename(file);
  const attachment = new AttachmentBuilder(file, { name });
  container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
  return { components: [container], flags: V2, files: [attachment] };
}

// Test/debug helper: pull every TextDisplay string out of a V2 payload.
export function textOf(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const data = typeof node.toJSON === 'function' ? node.toJSON() : node;
    if (Array.isArray(data)) return data.forEach(walk);
    if (data.content && (data.type === 10 || data.type === undefined)) out.push(data.content);
    if (Array.isArray(data.components)) data.components.forEach(walk);
    if (data.accessory) walk(data.accessory);
  };
  walk(payload.components || payload);
  return out.join('\n');
}
