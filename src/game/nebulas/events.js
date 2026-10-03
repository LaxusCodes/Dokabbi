import { on } from '../events/bus.js';
import { allNebulaDefs, memberOf, addNebulaRep, relationState, shiftRelation, allRelations, nebulaLog, getNebula } from './store.js';
import { signingFallout, politicalEvent, nebulaOfConstellation } from './politics.js';
import { recordEvent } from '../world/store.js';
import { getDb } from '../../database/db.js';

// The Nebula layer listens to the story — commands never call it directly.
let registered = false;
export function registerNebulaListeners() {
  if (registered) return;
  registered = true;
  on('sponsor_signed', ({ guildId, playerId, playerName, constellationId }) => {
    if (!guildId || guildId === 'dm') return;
    const defs = allNebulaDefs();
    const home = nebulaOfConstellation(constellationId, defs);
    const { shifts } = signingFallout({ constellationId, nebulaDefs: defs, relationships: home ? allRelations(guildId, home) : [] });
    for (const s of shifts) {
      if (s.repDelta) {
        // Members of the honored nebula share the glow.
        const members = getDb().prepare('SELECT discord_id FROM nebula_members WHERE nebula_id = ?').all(s.nebula);
        for (const m of members) addNebulaRep(m.discord_id, 2, guildId);
        nebulaLog(guildId, s.nebula, 'honor', `${playerName}'s sponsorship ${s.note}.`);
      }
      if (s.relationShift && home) {
        const next = shiftRelation(guildId, home, s.nebula, s.relationShift);
        nebulaLog(guildId, home, 'politics', `Relations with ${s.nebula} ${s.note} (${next}).`);
      }
    }
    // The signing player rises in their own faction — and rivals react publicly.
    const own = memberOf(playerId, guildId);
    if (own) addNebulaRep(playerId, home && own.nebula_id === home ? 10 : 3, guildId);
    const rival = home ? allRelations(guildId, home).find((r) => ['Competitive', 'Hostile', 'At War'].includes(r.state)) : null;
    const homeName = defs.find((n) => n.id === home)?.name;
    recordEvent(guildId, {
      kind: 'world_event', actorId: playerId,
      summary: politicalEvent({ homeName, rivalName: rival?.name, playerName, kind: 'signed', rng: Math.random }),
    });
  });

  on('sponsor_broken', ({ guildId, playerId, playerName, constellationId }) => {
    if (!guildId || guildId === 'dm') return;
    const home = nebulaOfConstellation(constellationId, allNebulaDefs());
    const own = memberOf(playerId, guildId);
    if (own) addNebulaRep(playerId, -5, guildId);
    const homeName = allNebulaDefs().find((n) => n.id === home)?.name;
    recordEvent(guildId, {
      kind: 'world_event', actorId: playerId,
      summary: politicalEvent({ homeName, playerName, kind: 'broken', rng: Math.random }),
    });
    if (home) nebulaLog(guildId, home, 'politics', `${playerName} broke faith. The slight is recorded.`);
  });

  on('scenario_altered', ({ guildId, playerId }) => {
    if (!guildId || guildId === 'dm') return;
    // Spoils and strain: the member's faction profits, rivals narrow their eyes.
    const own = memberOf(playerId, guildId);
    if (!own) return;
    getDb().prepare('UPDATE nebulas SET treasury = treasury + 200 WHERE id = ?').run(own.nebula_id);
    nebulaLog(guildId, own.nebula_id, 'spoils', `Altered fate yields 200 coins to the treasury.`);
  });

  on('scenario_cleared', ({ guildId, playerId }) => {
    if (!guildId || guildId === 'dm') return;
    const own = memberOf(playerId, guildId);
    if (own) addNebulaRep(playerId, 2, guildId);
  });
}

export { getNebula };
