import { getDb } from '../../database/db.js';
import { on } from '../events/bus.js';
import { getPartyWithMembers } from '../parties/store.js';
import { memberOf, allRelations } from '../nebulas/store.js';
import { snapshotTeamHistory } from './collection.js';

// Living cards: team cards track the living roster; history keeps the record.
// Departed members keep their copy (what happened), current members see the now.
export function syncTeamCard(partyId, guildId) {
  const db = getDb();
  const group = getPartyWithMembers(partyId);
  if (!group) {
    return; // disbanded: cards remain as history
  }
  const names = group.members.map((m) => m.name);
  const cardId = `team_${partyId}`;
  const arc = arcOf(group.members.map((m) => m.discord_id), guildId);
  const name = `[The Survivors of ${group.party.name}]`;
  // History first: the leaving member's roster is preserved before the living card updates.
  snapshotTeamHistory(cardId, name, names);
  const effect = `Living roster: ${names.join(', ')}.${arc} Updates as the party changes; past rosters remain in the world record.`;
  for (const m of group.members) {
    db.prepare(`INSERT INTO story_cards (card_id, discord_id, name, scenario_id, effect, power) VALUES (?,?,?,?,?,?)
      ON CONFLICT(card_id,discord_id) DO UPDATE SET name=?, effect=?`)
      .run(cardId, m.discord_id, name, 'party', effect, 2, name, effect);
  }
  return { cardId, name, members: names };
}

// Current arc: chapter + branch + allies/enemies + shared stories.
function arcOf(memberIds, guildId) {
  const parts = [];
  try {
    const ch = getDb().prepare(`SELECT chapter_no, data FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(guildId);
    if (ch) {
      const data = JSON.parse(ch.data);
      const branches = getDb().prepare('SELECT branch_key, path FROM chapter_branches WHERE guild_id = ? AND chapter_no = ? AND path IS NOT NULL').all(guildId, data.chapterNo);
      const mine = branches.find((b) => b.branch_key.startsWith('party:'));
      parts.push(` Current chapter: "${data.title}"${mine ? `, branch ${mine.path}` : ''}.`);
    }
    const ids = new Set(memberIds);
    const bonds = getDb().prepare('SELECT a, b FROM bond_counters WHERE guild_id = ? AND honored = 1').all(guildId)
      .filter((r) => ids.has(r.a) && ids.has(r.b)).length;
    if (bonds) parts.push(` Shared Stories: ${bonds} honored bond(s).`);
    const nebs = [...new Set(memberIds.map((id) => memberOf(id, guildId)?.nebula_id).filter(Boolean))];
    const allies = new Set();
    const enemies = new Set();
    for (const n of nebs) {
      for (const r of allRelations(guildId, n)) {
        if (['Cooperative', 'Interested'].includes(r.state)) allies.add(r.name);
        if (['Hostile', 'At War', 'Competitive'].includes(r.state)) enemies.add(r.name);
      }
    }
    if (allies.size) parts.push(` Allies: ${[...allies].join(', ')}.`);
    if (enemies.size) parts.push(` Enemies: ${[...enemies].join(', ')}.`);
  } catch {
    // cards never break the game
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

export function registerLivingCardListeners() {
  if (registerLivingCardListeners.done) return;
  registerLivingCardListeners.done = true;
  on('party_changed', ({ partyId, guildId }) => syncTeamCard(partyId, guildId));
}
