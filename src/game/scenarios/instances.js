import { getDb } from '../../database/db.js';
import templates from '../../../data/chapters.json' with { type: 'json' };

// Branch instances: who experienced which branch. The world stays shared;
// branches only track local perspective (path, locks, status).
export function branchKeyFor(discordId, party) {
  return party ? `party:${party.party.id}` : 'solo';
}

export function getOrCreateBranch(guildId, chapterNo, branchKey) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM chapter_branches WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').get(guildId, chapterNo, branchKey);
  if (!row) {
    db.prepare('INSERT INTO chapter_branches (guild_id, chapter_no, branch_key) VALUES (?,?,?)').run(guildId, chapterNo, branchKey);
    row = db.prepare('SELECT * FROM chapter_branches WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').get(guildId, chapterNo, branchKey);
  }
  return { ...row, locked_paths: JSON.parse(row.locked_paths || '[]') };
}

export function setBranchPath(guildId, chapterNo, branchKey, path) {
  getOrCreateBranch(guildId, chapterNo, branchKey);
  getDb().prepare('UPDATE chapter_branches SET path = ? WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').run(path, guildId, chapterNo, branchKey);
}

export function setBranchStatus(guildId, chapterNo, branchKey, status) {
  getDb().prepare('UPDATE chapter_branches SET status = ? WHERE guild_id = ? AND chapter_no = ? AND branch_key = ?').run(status, guildId, chapterNo, branchKey);
}

export function siblingBranches(guildId, chapterNo, exceptKey) {
  return getDb().prepare('SELECT * FROM chapter_branches WHERE guild_id = ? AND chapter_no = ? AND branch_key != ?').all(guildId, chapterNo, exceptKey)
    .map((r) => ({ ...r, locked_paths: JSON.parse(r.locked_paths || '[]') }));
}

export function allBranches(guildId, chapterNo) {
  return getDb().prepare('SELECT * FROM chapter_branches WHERE guild_id = ? AND chapter_no = ?').all(guildId, chapterNo)
    .map((r) => ({ ...r, locked_paths: JSON.parse(r.locked_paths || '[]') }));
}

// One party's act rewrites another's future: lock paths in sibling branches.
export function applyLocks(guildId, chapterNo, exceptKey, locks = []) {
  const notes = [];
  for (const sib of siblingBranches(guildId, chapterNo, exceptKey)) {
    const locked = new Set(sib.locked_paths.map((l) => l.path));
    let changed = false;
    for (const lock of locks) {
      if (!locked.has(lock.path)) {
        sib.locked_paths.push(lock);
        changed = true;
      }
    }
    if (changed) {
      getDb().prepare('UPDATE chapter_branches SET locked_paths = ? WHERE id = ?').run(JSON.stringify(sib.locked_paths), sib.id);
      notes.push({ branch: sib.branch_key, locks });
    }
  }
  return notes;
}

export function branchLockFor(branch, pathId) {
  return (branch.locked_paths || []).find((l) => l.path === pathId) || null;
}

// Locks derived from taken paths: a branch created AFTER the act still inherits
// the scar. Stored locks (applyLocks) cover live siblings; this covers everyone.
export function effectiveBranch(guildId, chapterNo, branch, paths = null) {
  const defs = paths || ((templates.find((x) => x.no === chapterNo) || templates[templates.length - 1]).paths || []);
  const taken = allBranches(guildId, chapterNo).filter((b) => b.branch_key !== branch.branch_key && b.path);
  const inherited = [];
  for (const b of taken) {
    const def = defs.find((p) => p.id === b.path);
    for (const lock of def?.consequences?.locks || []) {
      if (!inherited.some((l) => l.path === lock.path) && !(branch.locked_paths || []).some((l) => l.path === lock.path)) {
        inherited.push(lock);
      }
    }
  }
  return { ...branch, locked_paths: [...(branch.locked_paths || []), ...inherited] };
}

export function closeBranches(guildId, chapterNo) {
  getDb().prepare(`UPDATE chapter_branches SET status = 'closed' WHERE guild_id = ? AND chapter_no = ? AND status = 'open'`).run(guildId, chapterNo);
}
