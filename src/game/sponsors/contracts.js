import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { evaluateEligibility, SPONSOR_CATALOG } from './eligibility.js';
import { evaluateExpectation, describeExpectation } from './expectations.js';
import { tierFor, decayStep, expectationsConflict, FAILURE_FAVOR_PENALTY, COMPLETION_FAVOR_REWARD } from './relationship.js';
import { negotiate } from './negotiation.js';
import { PERSONA_OF } from '../constellations/personas.js';
import { constellationName, getWallet } from '../constellations/wallets.js';
import { mintStoryCard } from '../cards/mint.js';
import { recordEvent, grantKnowledge } from '../world/store.js';
import { perksFor } from '../titles/perks.js';
import { emit } from '../events/bus.js';
import { addAttention, grantDokjaKnowledge } from '../canon/store.js';
import { attentionDeltaFor } from '../canon/dokja.js';

// ---- signals: the game watching your actual history ----
export function gatherSignals(discordId) {
  const db = getDb();
  const p = getPlayer(discordId);
  const protect = db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice IN ('help','forewarn')`).get(discordId).v;
  const defy = db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice = 'forewarn'`).get(discordId).v
    + db.prepare(`SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND kind = 'scenario_altered'`).get(discordId).v;
  const pve = db.prepare(`SELECT COUNT(*) v FROM combat_logs WHERE kind = 'pve' AND participants LIKE '%' || ? || '%'`).get(discordId).v;
  const wagerWins = db.prepare(`SELECT COUNT(*) v FROM wagers WHERE kind = 'player' AND backer_id = ? AND status = 'won'`).get(discordId).v;
  const stories = db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(discordId).map((r) => r.story_id);
  return { clears: p?.scenario_progress || 0, protect, defy, pve, wagerWins, stories };
}

export function constellationFavor(discordId, constellationId) {
  const row = getDb().prepare('SELECT favor FROM constellation_favor WHERE discord_id = ? AND constellation_id = ?').get(discordId, constellationId);
  return row?.favor || 0;
}

export function addFavor(discordId, constellationId, delta) {
  const db = getDb();
  const cur = constellationFavor(discordId, constellationId);
  const next = cur + delta;
  db.prepare('INSERT INTO constellation_favor (discord_id, constellation_id, favor) VALUES (?,?,?) ON CONFLICT(discord_id,constellation_id) DO UPDATE SET favor=?')
    .run(discordId, constellationId, next, next);
  return next;
}

export function activeContract(discordId) {
  return getDb().prepare(`SELECT * FROM sponsorships WHERE discord_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`).get(discordId);
}

export function completedCount(discordId, constellationId) {
  return getDb().prepare(`SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND constellation_id = ? AND status = 'completed'`).get(discordId, constellationId).v;
}

export function pendingOffer(discordId, constellationId) {
  return getDb().prepare(`SELECT * FROM sponsorship_offers WHERE discord_id = ? AND constellation_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`).get(discordId, constellationId);
}

export function pendingOffers(discordId) {
  return getDb().prepare(`SELECT * FROM sponsorship_offers WHERE discord_id = ? AND status = 'pending' ORDER BY id`).all(discordId);
}

function logHistory(guildId, discordId, constellationId, kind, summary) {
  getDb().prepare('INSERT INTO sponsorship_history (guild_id, discord_id, constellation_id, kind, summary) VALUES (?,?,?,?,?)')
    .run(guildId, discordId, constellationId, kind, summary);
}

// ---- offers are earned: called after each scenario clear ----
export function checkForOffer(player, guildId) {
  const notices = [];
  if (activeContract(player.discord_id)) return notices;
  for (const constellationId of Object.keys(SPONSOR_CATALOG)) {
    if (pendingOffer(player.discord_id, constellationId)) continue;
    const signals = gatherSignals(player.discord_id);
    const wallet = getWallet(guildId, constellationId);
    const { eligible } = evaluateEligibility(constellationId, {
      clears: signals.clears,
      favor: constellationFavor(player.discord_id, constellationId),
      stories: signals.stories,
      signals,
      hasContract: false,
      influence: wallet?.influence || 0,
    });
    if (!eligible) continue;
    const spec = SPONSOR_CATALOG[constellationId];
    const current = activeContract(player.discord_id);
    const conflict = current ? 0 : pendingOffers(player.discord_id).some((o) => expectationsConflict(o.expectation_type, spec.expectation.type)) ? 1 : 0;
    getDb().prepare(`INSERT INTO sponsorship_offers (guild_id, discord_id, constellation_id, coins, stigma, expectation_type, expectation_required, duration, conflict)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(guildId, player.discord_id, constellationId, spec.coins, spec.stigma, spec.expectation.type, spec.expectation.required, 3, conflict);
    logHistory(guildId, player.discord_id, constellationId, 'offer', `${constellationName(constellationId)} is considering an offer.`);
    recordEvent(guildId, { kind: 'world_event', actorId: player.discord_id, summary: `📡 A constellation (${constellationName(constellationId)}) has noticed ${player.name}'s actions and is considering an offer.` });
    notices.push(constellationId);
  }
  return notices;
}

export function negotiateOffer(offerId, discordId, term) {
  const db = getDb();
  const offer = db.prepare('SELECT * FROM sponsorship_offers WHERE id = ? AND discord_id = ?').get(offerId, discordId);
  if (!offer || offer.status !== 'pending') throw new Error('No such pending offer.');
  const res = negotiate(PERSONA_OF[offer.constellation_id] || 'cautious', offer, term, offer.negotiations);
  if (!res.locked) {
    const patch = { negotiations: offer.negotiations + 1, ...(res.counter || {}) };
    const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE sponsorship_offers SET ${sets} WHERE id = ?`).run(...Object.values(patch), offerId);
  } else {
    db.prepare('UPDATE sponsorship_offers SET negotiations = negotiations + 1 WHERE id = ?').run(offerId);
  }
  return res;
}

export function acceptOffer(offerId, discordId, guildId) {
  const db = getDb();
  const offer = db.prepare('SELECT * FROM sponsorship_offers WHERE id = ? AND discord_id = ?').get(offerId, discordId);
  if (!offer || offer.status !== 'pending') throw new Error('No such pending offer.');
  if (activeContract(discordId)) throw new Error('Break your current contract first — a divided incarnation pleases no star.');
  const p = getPlayer(discordId);
  db.prepare(`UPDATE sponsorship_offers SET status = 'accepted' WHERE id = ?`).run(offerId);
  // Expire rival offers; their constellations remember the snub.
  for (const rival of pendingOffers(discordId)) {
    db.prepare(`UPDATE sponsorship_offers SET status = 'expired' WHERE id = ?`).run(rival.id);
    addFavor(discordId, rival.constellation_id, -5);
  }
  const c = db.prepare(`INSERT INTO sponsorships (guild_id, discord_id, constellation_id, favor_at_start, coins, stigma, duration)
    VALUES (?,?,?,?,?,?,?)`).run(guildId, discordId, offer.constellation_id, constellationFavor(discordId, offer.constellation_id), offer.coins, offer.stigma, offer.duration);
  db.prepare('INSERT INTO sponsorship_expectations (contract_id, type, required) VALUES (?,?,?)')
    .run(c.lastInsertRowid, offer.expectation_type, offer.expectation_required);
  updatePlayer(discordId, { coins: p.coins + offer.coins, sponsor_id: SPONSOR_CATALOG[offer.constellation_id].sponsorId });
  db.prepare('INSERT OR IGNORE INTO player_stigmas (discord_id, stigma_id) VALUES (?,?)').run(discordId, offer.stigma);
  const card = { card_id: `sponsored@${offer.constellation_id}`, name: '[The Incarnation Who Drew the Attention of a Star]', scenario_id: '—', effect: `Origin: Sponsorship Contract #${c.lastInsertRowid} with ${constellationName(offer.constellation_id)}. This Story records the moment a constellation chose you.`, power: 4 };
  mintStoryCard(db, discordId, card);
  logHistory(guildId, discordId, offer.constellation_id, 'contract', `Contract #${c.lastInsertRowid} signed.`);
  recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `⭐ ${p.name} signed with ${constellationName(offer.constellation_id)}. Expectation: ${describeExpectation(offer.expectation_type, offer.expectation_required)}.` });
  // Dokja notices a new star entering someone's story.
  addAttention(guildId, 8);
  grantDokjaKnowledge(guildId, `sponsored_${discordId}`, 'learned');
  if (offer.constellation_id === 'whispering_broker') {
    // An unusual sponsor. Dokja recognizes them — and says so.
    grantKnowledge(discordId, 'dokja_whisper_broker', 'dokja');
    addAttention(guildId, attentionDeltaFor('foreknow'));
  }
  emit('sponsor_signed', { guildId, playerId: discordId, playerName: p.name, constellationId: offer.constellation_id });
  return { contractId: c.lastInsertRowid, card };
}

export function declineOffer(offerId, discordId, guildId) {
  const db = getDb();
  const offer = db.prepare('SELECT * FROM sponsorship_offers WHERE id = ? AND discord_id = ?').get(offerId, discordId);
  if (!offer || offer.status !== 'pending') throw new Error('No such pending offer.');
  db.prepare(`UPDATE sponsorship_offers SET status = 'declined' WHERE id = ?`).run(offerId);
  addFavor(discordId, offer.constellation_id, -5);
  logHistory(guildId, discordId, offer.constellation_id, 'declined', 'Offer declined.');
}

export function breakContract(discordId, guildId) {
  const db = getDb();
  const c = activeContract(discordId);
  if (!c) throw new Error('No active contract.');
  db.prepare(`UPDATE sponsorships SET status = 'broken' WHERE id = ?`).run(c.id);
  addFavor(discordId, c.constellation_id, -20);
  updatePlayer(discordId, { sponsor_id: null });
  logHistory(guildId, discordId, c.constellation_id, 'broken', `Contract #${c.id} broken.`);
  recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `💔 ${getPlayer(discordId)?.name} broke faith with ${constellationName(c.constellation_id)}.` });
  emit('sponsor_broken', { guildId, playerId: discordId, playerName: getPlayer(discordId)?.name, constellationId: c.constellation_id });
}

export function expectationsOf(contractId) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sponsorship_expectations WHERE contract_id = ?').all(contractId);
  return rows;
}

// The game watches: call after each scenario clear. Returns narrative lines.
export function reviewContracts(player, guildId) {
  const lines = [];
  const c = activeContract(player.discord_id);
  if (!c) return lines;
  const db = getDb();
  const signals = gatherSignals(player.discord_id);
  db.prepare('UPDATE sponsorships SET scenarios_done = scenarios_done + 1 WHERE id = ?').run(c.id);
  const row = db.prepare('SELECT * FROM sponsorships WHERE id = ?').get(c.id);
  let allMet = true;
  for (const e of expectationsOf(c.id)) {
    const progress = evaluateExpectation(e.type, signals, e.required);
    const status = progress >= e.required ? 'fulfilled' : (row.scenarios_done >= row.duration ? 'failed' : 'open');
    db.prepare('UPDATE sponsorship_expectations SET progress = ?, status = ? WHERE contract_id = ? AND type = ?').run(progress, status, c.id, e.type);
    if (status !== 'fulfilled') allMet = false;
  }
  const favor = constellationFavor(player.discord_id, c.constellation_id);
  if (allMet) {
    db.prepare(`UPDATE sponsorships SET status = 'completed' WHERE id = ?`).run(c.id);
    const favorNext = addFavor(player.discord_id, c.constellation_id, COMPLETION_FAVOR_REWARD + perksFor(player.discord_id, { always: true }).favor);
    const p = getPlayer(player.discord_id);
    updatePlayer(player.discord_id, { coins: p.coins + 1000 });
    const tier = tierFor({ completed: completedCount(player.discord_id, c.constellation_id), favor: favorNext });
    let perk = '';
    if (tier === 'Patron' || tier === 'Favored' || tier === 'Trusted') {
      const s = db.prepare('SELECT level FROM player_stigmas WHERE discord_id = ? AND stigma_id = ?').get(player.discord_id, c.stigma);
      if (s) {
        db.prepare('UPDATE player_stigmas SET level = level + 1 WHERE discord_id = ? AND stigma_id = ?').run(player.discord_id, c.stigma);
        perk = ' Stigma deepened (Patron privilege).';
      }
    }
    if (tier === 'Trusted') {
      db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(player.discord_id, 'chosen_by_a_star');
      perk += ' Unique Story obtained: [Chosen by a Star].';
    }
    logHistory(guildId, player.discord_id, c.constellation_id, 'completed', `Contract #${c.id} fulfilled. Tier: ${tier}.`);
    recordEvent(guildId, { kind: 'world_event', actorId: player.discord_id, summary: `🌟 ${player.name} fulfilled ${constellationName(c.constellation_id)}'s expectation. Loyalty: ${tier}.${perk}` });
    lines.push(`📡 SPONSOR — expectation fulfilled! Loyalty: **${tier}**. +1000 coins.${perk}`);
  } else if (row.scenarios_done >= row.duration) {
    db.prepare(`UPDATE sponsorships SET status = 'failed' WHERE id = ?`).run(c.id);
    const failures = db.prepare(`SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND constellation_id = ? AND status = 'failed'`).get(player.discord_id, c.constellation_id).v;
    addFavor(player.discord_id, c.constellation_id, -FAILURE_FAVOR_PENALTY);
    updatePlayer(player.discord_id, { sponsor_id: null });
    logHistory(guildId, player.discord_id, c.constellation_id, 'failed', `Contract #${c.id} failed (${decayStep({ failures })}).`);
    lines.push(`📡 SPONSOR — expectation unmet. ${constellationName(c.constellation_id)} is **${decayStep({ failures })}**. Favor -${FAILURE_FAVOR_PENALTY}. The bond can still recover — earn a new offer.`);
  } else if (row.scenarios_done === row.duration - 1) {
    lines.push(`📡 SPONSOR — final scenario to prove yourself to ${constellationName(c.constellation_id)}.`);
  }
  return lines;
}

export function loyaltyOf(discordId, constellationId) {
  return tierFor({ completed: completedCount(discordId, constellationId), favor: constellationFavor(discordId, constellationId), hasActive: Boolean(activeContract(discordId)), hasOffer: pendingOffers(discordId).length > 0 });
}
