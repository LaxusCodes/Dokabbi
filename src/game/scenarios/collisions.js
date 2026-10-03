import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { runBattle } from '../combat/engine.js';
import { buildCombatantFromPlayer } from '../combat/fromPlayer.js';
import { applyXp } from '../progression/levels.js';
import { recordEvent } from '../world/store.js';
import { emit } from '../events/bus.js';

// Opposing objectives in one chapter: protect vs take, guard vs cut.
const OPPOSITES = [
  ['protect', 'ledger_cut'],
  ['gate_duty', 'ledger_cut'],
  ['cover', 'ledger_cut'],
];

export function pathsOppose(a, b) {
  return OPPOSITES.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

// Pure: which branch pairs collide.
export function detectCollisions(branches) {
  const withPath = branches.filter((b) => b.path && b.status === 'open');
  const out = [];
  for (let i = 0; i < withPath.length; i++) {
    for (let j = i + 1; j < withPath.length; j++) {
      const a = withPath[i];
      const b = withPath[j];
      if (pathsOppose(a.path, b.path)) {
        out.push({ branchA: a.branch_key, pathA: a.path, branchB: b.branch_key, pathB: b.path, kind: 'conflicting_objectives' });
      }
    }
  }
  return out;
}

export function openCollisions(guildId, chapterNo) {
  return getDb().prepare(`SELECT * FROM chapter_collisions WHERE guild_id = ? AND chapter_no = ? AND status = 'open'`).all(guildId, chapterNo);
}

export function recordCollisions(guildId, chapterNo, collisions) {
  const db = getDb();
  const fresh = [];
  for (const c of collisions) {
    const dup = db.prepare('SELECT id FROM chapter_collisions WHERE guild_id = ? AND chapter_no = ? AND status = ? AND ((branch_a = ? AND branch_b = ?) OR (branch_a = ? AND branch_b = ?))')
      .get(guildId, chapterNo, 'open', c.branchA, c.branchB, c.branchB, c.branchA);
    if (dup) continue;
    const r = db.prepare('INSERT INTO chapter_collisions (guild_id, chapter_no, branch_a, branch_b, kind) VALUES (?,?,?,?,?)')
      .run(guildId, chapterNo, c.branchA, c.branchB, c.kind);
    fresh.push({ ...c, id: r.lastInsertRowid });
  }
  return fresh;
}

// Clash: the branches settle it in shared combat. Winner dominates the chapter.
export function clashBranches(guildId, chapterNo, collisionId) {
  const db = getDb();
  const col = db.prepare('SELECT * FROM chapter_collisions WHERE id = ? AND guild_id = ?').get(collisionId, guildId);
  if (!col || col.status !== 'open') throw new Error('No such open collision.');
  const chapter = db.prepare(`SELECT * FROM chapter_instances WHERE guild_id = ? AND chapter_no = ?`).get(guildId, chapterNo);
  const inBranch = (key) => db.prepare('SELECT discord_id FROM chapter_participants WHERE chapter_id = ? AND branch_id = (SELECT id FROM chapter_branches WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?)')
    .all(chapter?.id, guildId, chapterNo, key).map((r) => r.discord_id);
  const aIds = inBranch(col.branch_a);
  const bIds = inBranch(col.branch_b);
  if (!aIds.length || !bIds.length) throw new Error('Both branches need champions to clash.');
  const toSide = (ids, team) => ids.map((id) => getPlayer(id)).filter(Boolean).map((p) => buildCombatantFromPlayer(p, { role: 'Damage', team }));
  const { winner, rounds, log } = runBattle(toSide(aIds, 'A'), toSide(bIds, 'B'), { scenarioTier: 3 });
  const winnerBranch = winner === 'A' ? col.branch_a : col.branch_b;
  const loserBranch = winner === 'A' ? col.branch_b : col.branch_a;
  db.prepare(`UPDATE chapter_collisions SET status = 'resolved' WHERE id = ?`).run(collisionId);
  db.prepare('UPDATE chapter_branches SET status = ? WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').run('dominant', guildId, chapterNo, winnerBranch);
  db.prepare('UPDATE chapter_branches SET status = ? WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').run('overruled', guildId, chapterNo, loserBranch);
  const results = [];
  for (const [ids, won] of [[aIds, winner === 'A'], [bIds, winner === 'B']]) {
    for (const id of ids) {
      const p = getPlayer(id);
      const { level, xp, leveled } = applyXp({ level: p.level, xp: p.xp }, won ? 100 : 30);
      updatePlayer(id, { xp, level, coins: p.coins + (won ? 350 : 100) });
      results.push(`${p.name}: ${won ? '+350 coins, +100 XP' : '+100 coins, +30 XP'}`);
    }
  }
  recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `⚔️ BRANCH COLLISION — ${winnerBranch} overrules ${loserBranch} in Chapter ${chapterNo} (${rounds} rounds). The server lives with the stronger story.` });
  emit('combat_finished', { guildId, kind: 'clash', winner: winnerBranch });
  return { winnerBranch, loserBranch, rounds, log, results };
}
