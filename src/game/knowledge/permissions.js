import { getDb } from '../../database/db.js';
import { getPlayerParty } from '../parties/store.js';
import { memberOf } from '../nebulas/store.js';

// Scopes were stored; now they are ENFORCED. Information warfare lives here.
export function knowledgeContext(viewerId, ownerId, guildId = null) {
  if (viewerId === ownerId) return { self: true };
  const vParty = getPlayerParty(viewerId)?.party.id || null;
  const oParty = getPlayerParty(ownerId)?.party.id || null;
  const vNeb = memberOf(viewerId, guildId)?.nebula_id || null;
  const oNeb = memberOf(ownerId, guildId)?.nebula_id || null;
  return { sameParty: Boolean(vParty && oParty && vParty === oParty), sameNebula: Boolean(vNeb && oNeb && vNeb === oNeb) };
}

export function entryVisibleTo(entry, viewerId, ownerId, ctx = knowledgeContext(viewerId, ownerId)) {
  if (ctx.self) return true;
  switch (entry.scope) {
    case 'global': return true; // the Stream itself carries it — every server hears
    case 'public': return true;
    case 'party': return Boolean(ctx.sameParty);
    case 'player': return entry.shared_with === viewerId;
    case 'nebula': return Boolean(ctx.sameNebula);
    default: return false; // private
  }
}

export function visibleKnowledgeOf(viewerId, ownerId, guildId = null) {
  const rows = getDb().prepare('SELECT * FROM player_knowledge WHERE discord_id = ?').all(ownerId);
  const ctx = knowledgeContext(viewerId, ownerId, guildId);
  return rows.filter((r) => entryVisibleTo(r, viewerId, ownerId, ctx));
}
