import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getOrCreateChapter, closeChapter, playerChapterCtx, chapterDisplay, decideChapter } from '../game/scenarios/director.js';
import { getOrCreateBranch, allBranches } from '../game/scenarios/instances.js';
import { partyBranchContext } from '../game/scenarios/participants.js';
import { openCollisions, clashBranches } from '../game/scenarios/collisions.js';
import { branchVerdict, chapterImportance, convergenceSummary } from '../game/scenarios/convergence.js';
import { readWorldSnapshot } from '../game/scenarios/history.js';
import { panel, streamPanel, verr, td, V2, sheet } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('chapter')
  .setDescription('Server chapters written by your history')
  .addSubcommand((s) => s.setName('current').setDescription('Show the open chapter (your branch included)'))
  .addSubcommand((s) => s.setName('decide').setDescription('Walk a path').addStringOption((o) => o.setName('path').setDescription('Path id').setRequired(true)))
  .addSubcommand((s) => s.setName('branches').setDescription('All parallel branches + Director verdicts'))
  .addSubcommand((s) => s.setName('collisions').setDescription('Open branch collisions'))
  .addSubcommand((s) => s.setName('clash').setDescription('Settle a collision in shared combat').addIntegerOption((o) => o.setName('id').setDescription('Collision id').setRequired(true)))
  .addSubcommand((s) => s.setName('advance').setDescription('(Admin) close this chapter; the Director writes the next'));

function branchOf(interaction, chapter) {
  const p = getPlayer(interaction.user.id);
  if (!p) return { branch: null, ctx: null, p: null };
  const guildId = interaction.guildId || 'dm';
  const { branchKey } = partyBranchContext(p.discord_id);
  return { branch: getOrCreateBranch(guildId, chapter.data.chapterNo, branchKey), ctx: playerChapterCtx(p.discord_id, guildId), p };
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'advance') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can turn the page.'), ephemeral: true });
    }
    closeChapter(guildId);
    const next = getOrCreateChapter(guildId);
    const { ctx } = branchOf(interaction, next);
    const disp = ctx ? chapterDisplay(next, ctx, null, guildId) : { text: 'A new chapter opens.' };
    return interaction.reply(streamPanel({ level: 'major', icon: '🚨', title: '📖 THE PAGE TURNS', bodyLines: [disp.text] }));
  }
  if (sub === 'branches') {
    const chapter = getOrCreateChapter(guildId);
    const branches = allBranches(guildId, chapter.data.chapterNo);
    if (!branches.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌿 BRANCHES', bodyLines: ['No branches yet. Walk a path first.'] }));
    const snapshot = readWorldSnapshot(guildId);
    const importance = chapterImportance(snapshot);
    const { getDb } = await import('../database/db.js');
    const verdicts = {};
    for (const b of branches) {
      const count = getDb().prepare('SELECT COUNT(*) v FROM chapter_participants WHERE chapter_id = ? AND branch_id = ?').get(chapter.id, b.id).v;
      const collides = (await import('../game/scenarios/collisions.js')).openCollisions(guildId, chapter.data.chapterNo)
        .some((c) => c.branch_a === b.branch_key || c.branch_b === b.branch_key);
      verdicts[b.branch_key] = branchVerdict(b, { participantCount: count, hasCollision: collides, dokjaAttention: snapshot.dokjaAttention, importance });
    }
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🌿 CHAPTER ${chapter.data.chapterNo} BRANCHES`, bodyLines: [convergenceSummary(chapter.data.chapterNo, branches, verdicts)] }));
  }
  if (sub === 'collisions') {
    const chapter = getOrCreateChapter(guildId);
    const open = openCollisions(guildId, chapter.data.chapterNo);
    if (!open.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '⚔️ COLLISIONS', bodyLines: ['No open collisions. The branches hold — for now.'] }));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '⚔️ OPEN COLLISIONS', bodyLines: [open.map((c) => `\`#${c.id}\` ${c.branchA} [${c.pathA}] vs ${c.branchB} [${c.pathB}] — settle with \`/chapter clash id:${c.id}\``).join('\n')] }));
  }
  if (sub === 'clash') {
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
    const chapter = getOrCreateChapter(guildId);
    try {
      const r = clashBranches(guildId, chapter.data.chapterNo, interaction.options.getInteger('id', true));
      const lines = r.log.slice(0, 8).map((e) => `R${e.round} ${e.text}`);
      return interaction.reply(streamPanel({
        level: 'important', icon: '⚔️', title: `⚔️ ${r.winnerBranch} overrules ${r.loserBranch}`,
        bodyLines: [`${r.rounds} rounds\n${lines.join('\n')}${r.log.length > 8 ? `\n… (${r.log.length - 8} more)` : ''}\n\n${r.results.join('\n')}`],
      }));
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const chapter = getOrCreateChapter(guildId);
  if (sub === 'current') {
    const { branch, ctx } = branchOf(interaction, chapter);
    const disp = chapterDisplay(chapter, ctx, branch, guildId);
    const buttons = disp.open.slice(0, 5).map((v) =>
      new ButtonBuilder().setCustomId(`ch:${chapter.id}:${v.path.id}`).setLabel(v.path.label.slice(0, 80)).setStyle(ButtonStyle.Primary)
    );
    const rows = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
    const extra = disp.open.length > 5 ? `\n-# ${disp.open.length - 5} more path(s) — use \`/chapter decide\`.` : '';
    return interaction.reply({ ...sheet(disp.text + extra, rows), ephemeral: true });
  }
  await decideChapter(interaction, chapter, interaction.options.getString('path', true));
}

export async function handlePathButton(interaction) {
  // customId: `ch:<chapterId>:<path>` (slash, ephemeral, owner-only by visibility)
  // or `ch:<chapterId>:<owner>:<path>` (prefix, public, enforce owner).
  const parts = interaction.customId.split(':');
  let chapterId;
  let pathId;
  let ownerId = null;
  if (parts.length >= 4) {
    chapterId = parts[1];
    ownerId = parts[2];
    pathId = parts.slice(3).join(':');
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ ...verr(`That path belongs to <@${ownerId}> — run \`orv chapter\` to get your own.`), ephemeral: true });
    }
  } else {
    chapterId = parts[1];
    pathId = parts.slice(2).join(':');
  }
  const { getDb } = await import('../database/db.js');
  const row = getDb().prepare('SELECT * FROM chapter_instances WHERE id = ?').get(chapterId);
  if (!row) return interaction.reply({ ...panel({ title: '📖 CHAPTER', body: 'That chapter has closed.' }), ephemeral: true });
  await interaction.update(sheet('🖋️ The ink is already moving…'));
  await decideChapter(interaction, { ...row, data: JSON.parse(row.data) }, pathId);
}
