import { getDb } from '../../database/db.js';
import { getPlayerParty } from '../parties/store.js';

// Who walked which branch of a chapter.
export function recordParticipant(chapterId, discordId, choice, branchId) {
  getDb().prepare('INSERT INTO chapter_participants (chapter_id, discord_id, choice, branch_id) VALUES (?,?,?,?) ON CONFLICT(chapter_id,discord_id) DO UPDATE SET choice=?, branch_id=?')
    .run(chapterId, discordId, choice, branchId, choice, branchId);
}

export function participantsOf(chapterId) {
  return getDb().prepare('SELECT * FROM chapter_participants WHERE chapter_id = ?').all(chapterId);
}

export function branchOfPlayer(chapterId, discordId) {
  return getDb().prepare('SELECT * FROM chapter_participants WHERE chapter_id = ? AND discord_id = ?').get(chapterId, discordId);
}

export function branchMembers(chapterId, branchId) {
  return getDb().prepare('SELECT discord_id FROM chapter_participants WHERE chapter_id = ? AND branch_id = ?').all(chapterId, branchId).map((r) => r.discord_id);
}

export function partyBranchContext(discordId) {
  const party = getPlayerParty(discordId);
  return { party, branchKey: party ? `party:${party.party.id}` : 'solo' };
}
