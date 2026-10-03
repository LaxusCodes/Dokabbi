import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer, createPlayer, nameTakenMessage } from './game/players/model.js';
import { statusEmbed } from './utils/embeds.js';
import { getDb } from './database/db.js';
import { recentEvents, getOrCreateStream, playerKnowledge, grantKnowledge, playerKnowledgeIds } from './game/world/store.js';
import { getScenario } from './game/scenarios/engine.js';
import { storyCardsOf } from './game/cards/mint.js';
import { getOrCreateChapter, playerChapterCtx, chapterDisplay } from './game/scenarios/director.js';
import { nextScenario } from './game/scenarios/engine.js';
import { visibleChoices } from './game/knowledge/system.js';
import { v2, panel, verr, dailyPanel, registerPanel, claimRow, beginTutorialRow } from './utils/v2.js';
import { scenarioChoiceRow, observeRow, pveMonsterRow, withNav } from './utils/menus.js';
import { embedTutorial, getStep, registerPrompt, refreshTutorialMessage } from './game/tutorial/progress.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from './game/cooldowns.js';
import { dailyView } from './game/daily/store.js';
import { runEncounter } from './game/daily/store.js';
import { activeContract, constellationFavor, loyaltyOf } from './game/sponsors/contracts.js';
import { constellationName } from './game/constellations/wallets.js';
import { getPlayerParty } from './game/parties/store.js';
import { memberOf } from './game/nebulas/store.js';
import { titleProgress } from './game/titles/evaluate.js';
import { assembleRecord, recordText } from './game/incarnations/record.js';
import { profileText } from './game/incarnations/profile.js';
import { activeTitles } from './game/titles/perks.js';
import { showcaseOf, collectionTally } from './game/cards/collection.js';
import { sentimentSummary } from './game/constellations/sentiment.js';
import { listTitles } from './game/titles/evaluate.js';
import knowledge from '../data/knowledge.json' with { type: 'json' };
import monsters from '../data/monsters.json' with { type: 'json' };

// Hub and reference replies carry the Jump dropdown; gameplay replies send
// only their contextual controls. Instantiated per command inside
// handlePrefixMessage (see below), where the resolved command is in scope.

// Guided replies (tutorial advanced on this action) send ONE message with the
// tutorial line embedded and NO Jump dropdown — learn line-by-line.
// The stored initiation message (if the player began it) is edited to match.
// Returns true when the payload was sent guided (caller returns).
async function sendGuided(message, payload, action, prefix) {
  if (!embedTutorial(payload, message.author.id, action, prefix)) return false;
  await message.reply(payload);
  refreshTutorialMessage(message.client, message.author.id, prefix).catch(() => null);
  return true;
}

// Short aliases: `orv s` = `orv status`. Slash commands can't alias;
// the prefix is the alias layer.
export const ALIASES = {
  s: 'status', reg: 'register', rk: 'rankings', j: 'journey', w: 'world',
  st: 'stream', ch: 'chapter', tut: 'tutorial', pf: 'profile', dly: 'daily',
  e: 'encounter', ob: 'observe', k: 'know', sp: 'sponsor', pa: 'party',
  nb: 'nebula', ti: 'titles', co: 'collection', sc: 'scenario', inc: 'incarnation',
};

export function resolveAlias(name) {
  return ALIASES[name] || name;
}

// One screen = one purpose. The global Jump menu lives only on hub and
// reference screens — never on gameplay responses (scenario, pve, daily,
// encounter, register, tutorial, ...), which own their contextual controls.
const NAV_SCREENS = new Set([
  'rank', 'rankings', 'world', 'journey', 'stream',
  'profile', 'titles', 'know', 'collection',
]);

// Message-prefix router: `orv <command>`. Read-only mirror of key slash commands;
// anything interactive (choices, votes, duels) stays slash-only.
export function parsePrefix(content, prefix) {
  const text = (content || '').trim();
  const lower = text.toLowerCase();
  if (lower !== prefix.toLowerCase() && !lower.startsWith(prefix.toLowerCase() + ' ')) return null;
  const rest = text.slice(prefix.length).trim();
  const [raw, ...args] = rest.split(/\s+/).filter(Boolean);
  const rawName = (raw || 'help').toLowerCase().replace(/^\/+/, ''); // tolerate `orv /register`
  const name = resolveAlias(rawName);
  return { name, args };
}

import { renderHelpPage } from './game/help/pages.js';

export async function handlePrefixMessage(message, prefix) {
  const parsed = parsePrefix(message.content, prefix);
  if (!parsed) return false;
  const { name, args } = parsed;
  // One screen = one purpose: Jump menu only on hub/reference screens.
  // (Keeps the legacy send(message, payload) call shape.)
  const send = (_msg, payload) => (NAV_SCREENS.has(name)
    ? message.reply(withNav(payload, message.author.id))
    : message.reply(payload));
  try {
    if (name === 'help') return void (await message.reply(renderHelpPage(0, prefix)));
    if (name === 'register') {
      const display = args.join(' ').slice(0, 32);
      if (!display) {
        if (!getPlayer(message.author.id)) {
          return void (await message.reply(v2(registerPrompt(prefix))));
        }
        return void (await send(message, v2(`Usage: \`${prefix} register <name>\` — e.g. \`${prefix} register Laxus\``)));
      }
      try {
        const p = createPlayer(message.author.id, display);
        const base = registerPanel({ name: p.name, coins: p.coins, prefix });
        const guided = { ...base, components: [...base.components, beginTutorialRow(message.author.id, prefix)] };
        if (await sendGuided(message, guided, 'register', prefix)) return;
        return void (await send(message, guided));
      } catch (e) {
        if (e?.code === 'NAME_TAKEN') return void (await send(message, verr(nameTakenMessage())));
        return void (await send(message, v2('Already registered. Try `orv status`.')));
      }
    }
    if (name === 'status') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const payload = statusEmbed(p, {
        sentiment: sentimentSummary(p.discord_id),
        next: nextScenario(p.scenario_progress),
      });
      if (await sendGuided(message, payload, 'status', prefix)) return;
      return void (await send(message, payload));
    }
    if (name === 'rankings' || name === 'rank') {
      const rows = getDb().prepare('SELECT name, level, coins, scenario_progress FROM players ORDER BY level DESC, coins DESC LIMIT 10').all();
      if (!rows.length) return void (await send(message, panel({ title: '🏆 STAR STREAM RANKINGS', body: 'No incarnations yet. Use `/register`.' })));
      return void (await send(message, panel({ title: '🏆 STAR STREAM RANKINGS', body: rows.map((r, i) => `${i + 1}. **${r.name}** — Lv ${r.level} • ${r.coins} coins • scenario #${r.scenario_progress}`).join('\n') })));
    }
    if (name === 'world') {
      const events = recentEvents(message.guildId || 'dm', 10).reverse();
      if (!events.length) return void (await send(message, panel({ title: '🌍 THE WORLD REMEMBERS', body: 'Nothing yet.' })));
      return void (await send(message, panel({ title: '🌍 THE WORLD REMEMBERS', body: events.map((e) => `• ${e.summary}`).join('\n') })));
    }
    if (name === 'journey') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const db = getDb();
      const stories = db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(p.discord_id);
      const cards = storyCardsOf(db, p.discord_id);
      const sText = stories.length ? stories.map((s) => `• [${s.story_id}]`).join('\n') : '_No Stories yet._';
      const cText = cards.length ? cards.map((c) => `🎴 **${c.name}** (power ${c.power})`).join('\n') : '_No journey cards yet._';
      return void (await send(message, panel({ title: `📖 ${p.name} — Lv ${p.level}`, body: `__Stories__\n${sText}\n\n__Journey cards__\n${cText}` })));
    }
    if (name === 'stream') {
      const guildId = message.guildId || 'dm';
      const stream = getOrCreateStream(guildId);
      const sc = getScenario(stream.current_scenario);
      return void (await send(message, panel({ title: '📡 STAR STREAM', body: `**${sc ? sc.title : 'Unknown'}** (server scenario: ${stream.current_scenario})` })));
    }
    if (name === 'chapter') {
      const guildId = message.guildId || 'dm';
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const chapter = getOrCreateChapter(guildId);
      const disp = chapterDisplay(chapter, playerChapterCtx(p.discord_id, guildId), null, guildId);
      const buttons = disp.open.slice(0, 5).map((v) =>
        new ButtonBuilder().setCustomId(`ch:${chapter.id}:${message.author.id}:${v.path.id}`).setLabel(v.path.label.slice(0, 80)).setStyle(ButtonStyle.Primary)
      );
      const rows = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
      const extra = disp.open.length > 5 ? `\n-# ${disp.open.length - 5} more path(s) — use \`/chapter decide\`.` : '';
      const base = panel({ title: '📖 CHAPTER', body: disp.text.slice(0, 3400) + extra });
      // Buttons first (walk a path), then the global nav dropdown.
      return void (await send(message, { ...base, components: [...base.components, ...rows] }));
    }
    if (name === 'tutorial') {
      // One initiation thread per incarnation — never a second one.
      // Reopens (and refreshes) the stored message, or starts it here.
      const p = getPlayer(message.author.id);
      if (!p) return void (await message.reply(v2(registerPrompt(prefix))));
      const { tutorialMessagePayload, setTutorialMessage, getStep } = await import('./game/tutorial/progress.js');
      const refreshed = await refreshTutorialMessage(message.client, p.discord_id, prefix).catch(() => false);
      if (refreshed) {
        const row = getDb().prepare('SELECT tutorial_msg_id, tutorial_channel_id FROM players WHERE discord_id = ?').get(p.discord_id);
        const loc = message.guildId && message.guildId !== 'dm' ? message.guildId : '@me';
        return void (await message.reply(v2(
          `🌌 Your initiation thread lives on — [continue here](https://discord.com/channels/${loc}/${row.tutorial_channel_id}/${row.tutorial_msg_id}).`
        )));
      }
      const payload = tutorialMessagePayload(getStep(p.discord_id), prefix, p.discord_id);
      const sentMsg = await message.reply(payload);
      try {
        if (sentMsg?.id) setTutorialMessage(p.discord_id, sentMsg.channelId || message.channelId, sentMsg.id);
      } catch { /* thread still shows — tracking is best-effort */ }
      return;
    }
    if (name === 'scenario') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const sc = nextScenario(p.scenario_progress);
      if (!sc) return void (await send(message, panel({ title: '📖 SCENARIO', body: 'Caught up with the stream.' })));
      const owned = playerKnowledgeIds(p.discord_id);
      const open = visibleChoices(sc, owned).filter((v) => !v.locked);
      const choiceRow = scenarioChoiceRow(sc.id, open, message.author.id);
      const rows = choiceRow ? [choiceRow] : [];
      const base = panel({
        title: `📖 [${sc.id}] ${sc.title}`,
        body: `${sc.description}\n\n__Visible paths__\n${open.map((v) => `• ${v.choice.label}`).join('\n')}\n\n-# Pick below 👇 or use \`/scenario current\`.`,
      });
      const guided = { ...base, components: [...base.components, ...rows] };
      if (await sendGuided(message, guided, 'scenario_current', prefix)) return;
      return void (await send(message, guided));
    }
    if (name === 'incarnation') {
      // Read-only record; legacy and rebirth stay in /incarnation.
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const text = recordText(assembleRecord(p.discord_id, message.guildId || 'dm'));
      return void (await send(message, panel({ body: text.slice(0, 3400) })));
    }
    if (name === 'profile') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const guildId = message.guildId || 'dm';
      const record = assembleRecord(p.discord_id, guildId);
      const slots = activeTitles(p.discord_id);
      const titleName = (id) => listTitles().find((t) => t.id === id)?.name || id;
      const titles = getDb().prepare('SELECT title_id FROM player_titles WHERE discord_id = ?').all(p.discord_id).map((r) => r.title_id);
      const payload = panel({
        body: profileText({
          name: p.name, title: p.title, level: p.level, status: p.status,
          activeTitle: slots.primary ? titleName(slots.primary) : null,
          titles: titles.map(titleName),
          showcase: showcaseOf(p.discord_id),
          companion: record?.companion || null,
          nebula: record?.neb?.nebula.name || null,
          sponsor: record?.contract?.constellation_id || null,
          relations: sentimentSummary(p.discord_id).rows,
        }),
      });
      if (await sendGuided(message, payload, 'profile', prefix)) return;
      return void (await send(message, payload));
    }
    if (name === 'daily') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const v = dailyView(p.discord_id);
      const base = dailyPanel({ missions: v.missions, streak: v.streak, checkin: v.checkin });
      return void (await send(message, { ...base, components: [...base.components, claimRow()] }));
    }
    if (name === 'encounter') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const wait = checkCooldown(p.discord_id, 'encounter', COOLDOWNS.encounter);
      if (wait) return void (await send(message, verr(cooldownMessage(wait, 'encounter'))));
      if (!tryBurst(p.discord_id, 'encounter')) return void (await send(message, verr(burstMessage())));
      try {
        const lines = runEncounter(p.discord_id, message.guildId || 'dm');
        setCooldown(p.discord_id, 'encounter', COOLDOWNS.encounter);
        return void (await send(message, panel({ title: '🎲 ENCOUNTER', body: lines.join('\n') })));
      } catch (e) {
        return void (await send(message, verr(e.message)));
      } finally {
        clearBurst(p.discord_id, 'encounter');
      }
    }
    if (name === 'pve') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const mon = monsters.find((m) => m.id === (args[0] || '').toLowerCase());
      if (!mon) {
        const base = v2(`Pick your foe 👇 — or type \`${prefix} pve <${monsters.map((m) => m.id).join('|')}>\``);
        return void (await send(message, { ...base, components: [...base.components, pveMonsterRow(message.author.id, monsters)] }));
      }
      // Same real battle as /pve: delegate to the slash pipeline through a
      // minimal interaction shim. Cooldowns, burst guard, rewards, tutorial
      // progress and the prefix-style Next line all ride along.
      const { execute: pveExecute } = await import('./commands/pve.js');
      const stepBefore = getStep(message.author.id);
      let captured = null;
      const follows = [];
      const fake = {
        user: { id: message.author.id },
        guildId: message.guildId || 'dm',
        prefix,
        options: {
          getString: (opt) => {
            if (opt === 'monster') return mon.id;
            if (opt === 'focus') return args[1] || 'front';
            return null;
          },
          getBoolean: () => false,
        },
        replied: false,
        deferred: false,
        reply: async (pl) => { delete pl.ephemeral; captured = pl; fake.replied = true; },
        followUp: async (pl) => { delete pl.ephemeral; follows.push(pl); },
      };
      try {
        await pveExecute(fake);
      } catch (e) {
        console.error(e);
        return void (await send(message, verr('The stream flickers... an error occurred.')));
      }
      if (captured) {
        // Guided (tutorial advanced): one message, no Jump dropdown.
        if (getStep(message.author.id) !== stepBefore) {
          await message.reply(captured);
          refreshTutorialMessage(message.client, message.author.id, prefix).catch(() => null);
        } else await send(message, captured);
      }
      for (const f of follows) await send(message, f);
      return;
    }
    if (name === 'observe') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const focus = (args[0] || '').toLowerCase();
      const spots = { subway: ['foreknow_001', 'pattern_lurker'], station: ['foreknow_002'] };
      if (!spots[focus]) {
        const base = v2(`Pick where to look 👇 (10 energy) — or type \`${prefix} observe <subway|station>\``);
        return void (await send(message, { ...base, components: [...base.components, observeRow(message.author.id)] }));
      }
      if (p.energy < 10) return void (await send(message, verr('Too exhausted (need 10 energy).')));
      const wait = checkCooldown(p.discord_id, 'observe', COOLDOWNS.observe);
      if (wait) return void (await send(message, verr(cooldownMessage(wait, 'observe'))));
      if (!tryBurst(p.discord_id, 'observe')) return void (await send(message, verr(burstMessage())));
      try {
        const { updatePlayer } = await import('./game/players/model.js');
        updatePlayer(p.discord_id, { energy: p.energy - 10 });
        setCooldown(p.discord_id, 'observe', COOLDOWNS.observe);
        const owned = playerKnowledgeIds(p.discord_id);
        const fresh = spots[focus].filter((id) => !owned.includes(id));
        if (!fresh.length) return void (await send(message, panel({ title: '👁 OMNISCIENCE', body: 'You notice nothing new.' })));
        const found = [];
        for (const id of fresh) {
          if (grantKnowledge(p.discord_id, id, `observe:${focus}`)) {
            found.push(knowledge.find((k) => k.id === id));
          }
        }
        return void (await send(message, panel({ title: '👁 OMNISCIENCE', body: found.map((k) => `**${k.title}**\n${k.body}`).join('\n\n') })));
      } finally {
        clearBurst(p.discord_id, 'observe');
      }
    }
    if (name === 'know') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const rows = playerKnowledge(p.discord_id);
      if (!rows.length) return void (await send(message, panel({ title: '📚 KNOWLEDGE', body: 'Nothing yet. Try `orv observe`.' })));
      const titleOf = (id) => knowledge.find((k) => k.id === id)?.title || id;
      return void (await send(message, panel({ title: '📚 KNOWLEDGE', body: rows.map((r) => `• \`${r.knowledge_id}\` — ${titleOf(r.knowledge_id)}`).join('\n') })));
    }
    if (name === 'sponsor') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const { activeContract: active } = await import('./game/sponsors/contracts.js');
      const c = active(p.discord_id);
      if (!c) return void (await send(message, panel({ title: '⭐ SPONSOR', body: 'No contract. Sponsors are earned — survive, gather Stories, defy fate.' })));
      const favor = constellationFavor(p.discord_id, c.constellation_id);
      const tier = loyaltyOf(p.discord_id, c.constellation_id);
      return void (await send(message, panel({ title: `⭐ ${constellationName(c.constellation_id)}`, body: `Loyalty **${tier}** (favor ${favor})\nContract #${c.id}: ${c.scenarios_done}/${c.duration} scenarios` })));
    }
    if (name === 'party') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const group = getPlayerParty(p.discord_id);
      if (!group) return void (await send(message, panel({ title: '👥 PARTY', body: 'No party. Create one with `/party create`.' })));
      return void (await send(message, panel({ title: `👥 ${group.party.name}`, body: group.members.map((m) => `• **${m.name}** (Lv ${m.level}) — ${m.role}`).join('\n') })));
    }
    if (name === 'nebula') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const m = memberOf(p.discord_id, message.guildId || 'dm');
      if (!m) return void (await send(message, panel({ title: '🌌 NEBULA', body: 'Sworn to none. See `/nebula list`.' })));
      return void (await send(message, panel({ title: `🌌 ${m.nebula.name}`, body: `Rank **${m.rank}** (rep ${m.reputation}) • Treasury ${m.nebula.treasury}` })));
    }
    if (name === 'titles') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const { titleProgress: progress } = await import('./game/titles/evaluate.js');
      const rows = progress(p.discord_id, message.guildId || 'dm');
      const earned = rows.filter((r) => r.owned);
      if (!earned.length) return void (await send(message, panel({ title: '👑 TITLES', body: 'None yet. Live dangerously.' })));
      return void (await send(message, panel({ title: `👑 TITLES (${earned.length}/${rows.length})`, body: earned.map((r) => `${r.def.emoji} **${r.def.name}**`).join('\n') })));
    }
    if (name === 'collection') {
      const p = getPlayer(message.author.id);
      if (!p) return void (await send(message, verr('Use `/register` first.')));
      const { collectionTally } = await import('./game/cards/collection.js');
      const cards = getDb().prepare('SELECT * FROM story_cards WHERE discord_id = ?').all(p.discord_id);
      const tally = collectionTally(cards);
      const cats = Object.entries(tally.byCategory).map(([k, n]) => `${k}: ${n}`).join(' • ') || 'empty';
      const rare = Object.entries(tally.byRarity).map(([k, n]) => `${k}: ${n}`).join(' • ') || '';
      return void (await send(message, panel({ title: `🎴 ${p.name} — COLLECTION`, body: `${cats}${rare ? `\n${rare}` : ''}\n\n-# Full view: \`/collection view\`.` })));
    }
    return void (await send(message, verr(`Unknown: \`${name}\`. Try \`${prefix} help\`.`)));
  } catch (e) {
    console.error(e);
    await send(message, verr('The stream flickers... an error occurred.'));
    return true;
  }
}
