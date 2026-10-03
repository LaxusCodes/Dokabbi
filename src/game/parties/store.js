import { randomUUID } from 'node:crypto';
import { getDb } from '../../database/db.js';
import { validateRole } from '../combat/engine.js';
import { PARTY_MAX } from './system.js';
import { emit } from '../events/bus.js';

export function getPartyWithMembers(partyId) {
  const db = getDb();
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
  if (!party) return null;
  const members = db
    .prepare(
      `SELECT p.*, m.role FROM party_members m JOIN players p ON p.discord_id = m.discord_id WHERE m.party_id = ? ORDER BY m.joined_at`
    )
    .all(partyId);
  return { party, members };
}

export function getPlayerParty(discordId) {
  const db = getDb();
  const row = db.prepare('SELECT party_id FROM players WHERE discord_id = ?').get(discordId);
  if (!row?.party_id) return null;
  return getPartyWithMembers(row.party_id);
}

export function createParty(leaderId, name) {
  const db = getDb();
  const me = db.prepare('SELECT party_id FROM players WHERE discord_id = ?').get(leaderId);
  if (!me) throw new Error('Register first with /register.');
  if (me.party_id) throw new Error('Already in a party. Leave it first.');
  const id = randomUUID().slice(0, 8);
  db.prepare('INSERT INTO parties (id, name, leader_id, created_at) VALUES (?,?,?,datetime(\'now\'))').run(id, name.slice(0, 32), leaderId);
  db.prepare('INSERT INTO party_members (party_id, discord_id, role) VALUES (?,?,?)').run(id, leaderId, 'Leader');
  db.prepare('UPDATE players SET party_id = ? WHERE discord_id = ?').run(id, leaderId);
  emit('party_changed', { partyId: id });
  return getPartyWithMembers(id);
}

export function joinParty(discordId, partyId) {
  const db = getDb();
  const me = db.prepare('SELECT party_id FROM players WHERE discord_id = ?').get(discordId);
  if (!me) throw new Error('Register first with /register.');
  if (me.party_id) throw new Error('Already in a party. Leave it first.');
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
  if (!party) throw new Error('No such party.');
  const count = db.prepare('SELECT COUNT(*) v FROM party_members WHERE party_id = ?').get(partyId).v;
  if (count >= PARTY_MAX) throw new Error(`Party is full (${PARTY_MAX}).`);
  db.prepare('INSERT INTO party_members (party_id, discord_id, role) VALUES (?,?,?)').run(partyId, discordId, 'Damage');
  db.prepare('UPDATE players SET party_id = ? WHERE discord_id = ?').run(partyId, discordId);
  emit('party_changed', { partyId });
  return getPartyWithMembers(partyId);
}

export function leaveParty(discordId) {
  const db = getDb();
  const me = db.prepare('SELECT party_id FROM players WHERE discord_id = ?').get(discordId);
  if (!me?.party_id) throw new Error('Not in a party.');
  const partyId = me.party_id;
  db.prepare('DELETE FROM party_members WHERE party_id = ? AND discord_id = ?').run(partyId, discordId);
  db.prepare('UPDATE players SET party_id = NULL WHERE discord_id = ?').run(discordId);
  const left = db.prepare('SELECT COUNT(*) v FROM party_members WHERE party_id = ?').get(partyId).v;
  if (left === 0) {
    db.prepare('DELETE FROM parties WHERE id = ?').run(partyId);
    emit('party_changed', { partyId });
    return null;
  }
  const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId);
  if (party.leader_id === discordId) {
    const next = db.prepare('SELECT discord_id FROM party_members WHERE party_id = ? ORDER BY joined_at LIMIT 1').get(partyId);
    db.prepare('UPDATE parties SET leader_id = ? WHERE id = ?').run(next.discord_id, partyId);
  }
  emit('party_changed', { partyId });
  return getPartyWithMembers(partyId);
}

export function setMemberRole(discordId, role) {
  validateRole(role);
  const db = getDb();
  const me = db.prepare('SELECT party_id FROM players WHERE discord_id = ?').get(discordId);
  if (!me?.party_id) throw new Error('Not in a party.');
  db.prepare('UPDATE party_members SET role = ? WHERE party_id = ? AND discord_id = ?').run(role, me.party_id, discordId);
  return getPartyWithMembers(me.party_id);
}
