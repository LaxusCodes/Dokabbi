import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { getPlayerParty } from '../parties/store.js';
import { memberOf, addNebulaRep } from '../nebulas/store.js';
import { statesFor } from '../characters/relationships.js';
import { generateChapter } from './generator.js';
import { resolvePath } from './branches.js';
import { filterPaths, meetsRequires } from './conditions.js';
import { readWorldSnapshot } from './history.js';
import { applyXp, levelUpGains } from '../progression/levels.js';
import { factionModifier } from '../combat/conditions.js';
import { setFlag, recordEvent, playerKnowledgeIds, adjustTrust, grantKnowledge } from '../world/store.js';
import { getOrCreateBranch, setBranchPath, applyLocks, branchLockFor, closeBranches, allBranches, effectiveBranch } from './instances.js';
import { pressureFor } from '../canon/divergence.js';
import { addAttention } from '../canon/store.js';
import { getChannel, featuredGuild, recordGlobalEvent } from '../starstream/store.js';
import { scheduleEcho, echoFor } from '../world/echoes.js';
import { pressureLevel, pressureLine } from '../starstream/pressure.js';
import { rewardBonusFor } from '../starstream/economy.js';
import { recordParticipant, partyBranchContext } from './participants.js';
import { detectCollisions, recordCollisions } from './collisions.js';
import { checkDiscovery } from '../cards/discovery.js';
import { addFavor, checkForOffer, reviewContracts } from '../sponsors/contracts.js';
import { requireAlive } from '../incarnations/lifecycle.js';
import { bumpCounter } from '../titles/counters.js';
import { evaluateTitles } from '../titles/evaluate.js';
import { emTitle } from '../display/emojis.js';
import { perksFor } from '../titles/perks.js';
import { storyFromAchievement } from '../stories/system.js';
import { storyCardFor, mintStoryCard } from '../cards/mint.js';
import { reactToOutcome } from '../constellations/system.js';
import { broadcastComponents } from '../../utils/embeds.js';
import { sep, td, V2, verr } from '../../utils/v2.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../cooldowns.js';
import { emit } from '../events/bus.js';

// The ORV Director: given everything that happened, what happens next?
export function getOrCreateChapter(guildId) {
  const db = getDb();
  let row = db.prepare(`SELECT * FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(guildId);
  if (!row) {
    const snapshot = readWorldSnapshot(guildId);
    const chapter = generateChapter(snapshot.chapterNo, snapshot);
    const r = db.prepare('INSERT INTO chapter_instances (guild_id, chapter_no, data) VALUES (?,?,?)')
      .run(guildId, chapter.chapterNo, JSON.stringify(chapter));
    row = db.prepare('SELECT * FROM chapter_instances WHERE id = ?').get(r.lastInsertRowid);
    recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `🌌 STAR STREAM — CHAPTER ${String(chapter.chapterNo).padStart(3, '0')}: "${chapter.title}". Previous actions have changed the scenario.` });
    // Canon pressure surfaces automatically: anomalous servers are marked once per chapter.
    const pressure = pressureFor(snapshot.divergenceBand);
    const anomalyFlag = `canon.anomaly.${chapter.chapterNo}`;
    if ((snapshot.divergenceBand === 'anomaly' || snapshot.divergenceBand === 'rupture') && (snapshot.flags[anomalyFlag] !== 'marked')) {
      setFlag(guildId, anomalyFlag, 'marked');
      addAttention(guildId, pressure.dokjaDelta);
      const summary = `⚠️ CANON ${snapshot.divergenceBand.toUpperCase()} — Server divergence ${snapshot.divergence}. ${pressure.note}`;
      recordEvent(guildId, { kind: 'world_event', actorId: null, summary });
      recordGlobalEvent({ kind: 'anomaly', summary: `⚠️ Server ${guildId} broke canon (divergence ${snapshot.divergence}). The Stream marks it an anomaly.`, originGuild: guildId });
      const aecho = echoFor.anomaly(guildId);
      scheduleEcho(guildId, aecho.kind, aecho.summary, aecho.delayMs);
    }
  }
  return { ...row, data: JSON.parse(row.data) };
}

export function closeChapter(guildId) {
  const row = getDb().prepare(`SELECT chapter_no FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(guildId);
  getDb().prepare(`UPDATE chapter_instances SET status = 'closed' WHERE guild_id = ? AND status = 'open'`).run(guildId);
  if (row) closeBranches(guildId, row.chapter_no);
}

export function playerChapterCtx(discordId, guildId) {
  const db = getDb();
  const p = getPlayer(discordId);
  const party = getPlayerParty(discordId);
  const neb = memberOf(discordId, guildId);
  const snapshot = readWorldSnapshot(guildId);
  return {
    knowledgeIds: playerKnowledgeIds(discordId),
    stories: db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(discordId).map((r) => r.story_id),
    partySize: party ? party.members.length : 1,
    nebulaId: neb?.nebula_id || null,
    reputation: neb?.reputation || 0,
    flags: snapshot.flags,
    level: p?.level || 1,
    relationships: statesFor(p.discord_id, guildId),
  };
}

export function chapterDisplay(chapter, ctx, branch = null, guildId = 'dm') {
  const vis = filterPaths(chapter.data.paths, ctx);
  const effBranch = branch ? effectiveBranch(guildId, chapter.data.chapterNo, branch, chapter.data.paths) : null;
  const layers = { individual: '🧍', party: '👥', faction: '🏛️', global: '🌌', hidden: '❓' };
  // Sibling branches rewrite your future: locked paths show their scars.
  const scarred = [];
  const open = vis.filter((v) => {
    if (v.locked) return false;
    const lock = effBranch ? branchLockFor(effBranch, v.path.id) : null;
    if (lock) {
      scarred.push(`🔒 [${v.path.id}] ${v.path.label} — ${lock.reason}`);
      return false;
    }
    return true;
  });
  const lines = open.map((v) => `${layers[v.path.layer] || '•'} [${v.path.id}] ${v.path.label} _(risk: ${v.path.risk})_`);
  const locked = vis.length - open.length - scarred.length;
  const brief = chapter.data.brief.length ? `\n\n_${chapter.data.brief.join('\n')}_` : '';
  const branchLine = branch?.path ? `\n_Your branch (${branch.branch_key}): **${branch.path}**._` : '';
  return {
    open,
    text:
      `🌌 STAR STREAM — CHAPTER ${String(chapter.data.chapterNo).padStart(3, '0')}\n**"${chapter.data.title}"**${brief}${branchLine}\n\nAvailable paths:\n${lines.join('\n')}` +
      (scarred.length ? `\n${scarred.join('\n')}` : '') +
      (locked ? `\n❓ ${locked} hidden path(s) sense knowledge you lack...` : '') +
      `\n\n_Difficulty ${chapter.data.difficulty.level} — generated from ${chapter.data.generatedFrom.clears} clears, ${chapter.data.generatedFrom.alters} alterations._`,
  };
}

export async function decideChapter(interaction, chapter, choiceId) {
  const db = getDb();
  const guildId = interaction.guildId || 'dm';
  const p = getPlayer(interaction.user.id);
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
  const ctx = playerChapterCtx(p.discord_id, guildId);
  const path = chapter.data.paths.find((x) => x.id === choiceId);
  if (!path) return interaction.reply({ ...verr('That path does not exist in this chapter.'), ephemeral: true });
  if (!meetsRequires(path.requires, ctx)) {
    return interaction.reply({ ...verr('Something bars that path. (A requirement you do not meet.)'), ephemeral: true });
  }
  const done = db.prepare('SELECT choice FROM chapter_participants WHERE chapter_id = ? AND discord_id = ?').get(chapter.id, p.discord_id);
  if (done) return interaction.reply({ ...verr(`You already walked a path here: ${done.choice}.`), ephemeral: true });

  // Branches: your party (or your solitude) is your instance of this chapter.
  const { branchKey } = partyBranchContext(p.discord_id);
  const branch = effectiveBranch(guildId, chapter.data.chapterNo, getOrCreateBranch(guildId, chapter.data.chapterNo, branchKey), chapter.data.paths);
  const lock = branchLockFor(branch, path.id);
  if (lock) return interaction.reply({ ...verr(`⚠️ ${lock.reason}`), ephemeral: true });

  // 10-min per-player cooldown on walking a path (viewing `current` stays free).
  const wait = checkCooldown(p.discord_id, 'chapter', COOLDOWNS.chapter);
  if (wait) {
    const msg = { ...verr(cooldownMessage(wait, 'chapter')), ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(msg);
    return interaction.reply(msg);
  }
  if (!tryBurst(p.discord_id, 'chapter')) {
    const msg = { ...verr(burstMessage()), ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.followUp(msg);
    return interaction.reply(msg);
  }
  try {
    setCooldown(p.discord_id, 'chapter', COOLDOWNS.chapter);
    const fmod = factionModifier(guildId, p.discord_id);
  // Equipped epithets pay out on chapter paths too.
  const titleCtx = {
    always: true, party: ctx.partySize > 1, solo: ctx.partySize <= 1,
    peaceful: ['protect', 'cover', 'testify', 'defer', 'ask_reader'].includes(path.id),
    altered: ['eastern_route', 'plaza_truth'].includes(path.id),
    story: Boolean(path.consequences?.story), faction: Boolean(path.consequences?.nebulaRep),
  };
  const titleBonus = perksFor(p.discord_id, titleCtx).reward;
  // Storm rates: channel value + probability pressure boost the bounty, never the outcome.
  const channel = getChannel(guildId);
  const featured = featuredGuild() === guildId;
  const stormBonus = rewardBonusFor(channel.channel_value) + (pressureLevel(channel.disturbance) === 'warning' ? 10 : 0) + (featured ? 5 : 0);
  const outcome = resolvePath(path, { rewardMult: chapter.data.difficulty.rewardMult, factionRewardPct: fmod.rewardPct + stormBonus + titleBonus });
  const { level, xp, leveled } = applyXp({ level: p.level, xp: p.xp }, outcome.xp);
  updatePlayer(p.discord_id, { coins: p.coins + outcome.coins, xp, level, hp: p.max_hp });

  // Persistent consequences — the choice keeps working after the reward fades.
  const fx = outcome.effects;
  for (const [k, v] of fx.flags) setFlag(guildId, k, v);
  for (const [cid, d] of Object.entries(fx.favor)) addFavor(p.discord_id, cid, d);
  if (guildId !== 'dm') {
    for (const t of fx.trust) adjustTrust(guildId, t.npc, p.discord_id, t.delta);
    if (fx.nebulaRep) {
      const target = fx.nebulaRep.mine ? memberOf(p.discord_id, guildId)?.nebula_id : fx.nebulaRep.nebula;
      if (target) {
        const members = db.prepare('SELECT discord_id FROM nebula_members WHERE nebula_id = ?').all(target);
        if (members.some((m) => m.discord_id === p.discord_id)) addNebulaRep(p.discord_id, fx.nebulaRep.delta, guildId);
      }
    }
  }
  let minted = null;
  if (fx.story) {
    const def = storyFromAchievement(fx.story);
    if (def) {
      db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?, ?)').run(p.discord_id, def.id);
      minted = storyCardFor({ storyId: def.id, storyName: def.name, scenarioId: `CH${chapter.data.chapterNo}`, choiceId: path.id, power: def.power });
      mintStoryCard(db, p.discord_id, minted);
    }
  }
  recordParticipant(chapter.id, p.discord_id, path.id, branch.id);
  setBranchPath(guildId, chapter.data.chapterNo, branchKey, path.id);
  const branchLines = [];
  if (fx.knowledge) {
    grantKnowledge(p.discord_id, fx.knowledge, 'chapter');
    branchLines.push(`👁 Branch knowledge gained: **${fx.knowledge}** (private until shared).`);
  }
  // Your act rewrites sibling branches' futures.
  if (guildId !== 'dm' && fx.locks.length) {
    const notes = applyLocks(guildId, chapter.data.chapterNo, branchKey, fx.locks);
    for (const n of notes) {
      for (const l of n.locks) {
        recordEvent(guildId, { kind: 'world_event', actorId: p.discord_id, summary: `⚠️ ${l.reason} (${n.branch} must find another way).` });
        branchLines.push(`⚠️ ${l.reason}`);
      }
    }
  }
  // Opposing branches collide in the open.
  if (guildId !== 'dm') {
    const freshHits = recordCollisions(guildId, chapter.data.chapterNo, detectCollisions(allBranches(guildId, chapter.data.chapterNo)));
    for (const c of freshHits) {
      recordEvent(guildId, { kind: 'world_event', actorId: p.discord_id, summary: `⚔️ CONFLICTING OBJECTIVES — ${c.branchA} [${c.pathA}] vs ${c.branchB} [${c.pathB}]. Resolve with /chapter clash.` });
      branchLines.push(`⚔️ COLLISION: **${c.branchA}** vs **${c.branchB}** — conflicting objectives! Use \`/chapter clash\`.`);
    }
    // Mysteries solve themselves when the world earns it.
    const solved = checkDiscovery(guildId, chapter.data.chapterNo);
    if (solved?.awarded) branchLines.push(`🌌 DISCOVERY SOLVED — **${solved.card.name}** awarded to ${solved.participants.length} witnesses.`);
  }
  if (guildId !== 'dm') {
    recordEvent(guildId, { kind: 'world_event', actorId: p.discord_id, summary: `📖 Chapter ${chapter.data.chapterNo}: ${p.name} ${fx.worldLine}.` });
  }
  const lines = reactToOutcome('success');
  const fresh = getPlayer(p.discord_id);
  const sponsorLines = [];
  if (ctx.partySize <= 1) bumpCounter(p.discord_id, 'solo_clears');
  for (const d of evaluateTitles(p.discord_id, guildId).fresh) {
    sponsorLines.push(`👑 Title earned: ${emTitle(d.id, d.emoji)} **${d.name}**`);
  }
  if (guildId !== 'dm') {
    for (const cid of checkForOffer(fresh, guildId)) {
      const { constellationName } = await import('../constellations/wallets.js');
      sponsorLines.push(`📡 A constellation (${constellationName(cid)}) has noticed your actions.`);
    }
    sponsorLines.push(...reviewContracts(fresh, guildId));
  }
  emit('scenario_cleared', { guildId, playerId: p.discord_id });
  const payload = {
    components: [
      td(
        `You chose **${path.label}**.\n+${outcome.coins} coins, +${outcome.xp} XP${leveled.length ? ` — **Level up! Lv ${level}**` : ''}` +
        `${minted ? `\n🎴 Journey card minted: **${minted.name}**` : ''}` +
        `${fmod.line ? `\n${fmod.line}` : ''}` +
        `${branchLines.length ? `\n\n${branchLines.join('\n')}` : ''}` +
        `${sponsorLines.length ? `\n\n${sponsorLines.join('\n')}` : ''}\n_The world records this._`
      ),
      sep(),
      ...broadcastComponents(lines),
    ],
    flags: V2,
  };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
  } finally {
    clearBurst(p.discord_id, 'chapter');
  }
}
