import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { validatePlayerStake, settleWagers, isUnderdogWin, poolTotals } from './engine.js';
import { personaWager, PERSONA_OF } from '../constellations/personas.js';
import { perksFor } from '../titles/perks.js';
import { getOrSeedWallets, lockStake, releaseEscrow, refundEscrow, constellationName } from '../constellations/wallets.js';

export function openWagers(guildId, globalId) {
  return getDb().prepare(`SELECT * FROM wagers WHERE guild_id = ? AND global_id = ? AND status = 'open'`).all(guildId, globalId);
}

export function playerOpenCount(guildId, discordId) {
  return getDb().prepare(`SELECT COUNT(*) v FROM wagers WHERE guild_id = ? AND backer_id = ? AND kind = 'player' AND status = 'open'`)
    .get(guildId, discordId).v;
}

// Player stake: coins leave the balance NOW (escrow), credited back only on win/refund.
export function placePlayerWager(guildId, globalId, discordId, side, amount) {
  const p = getPlayer(discordId);
  if (!p) throw new Error('Register first with /register.');
  if (side !== 'A' && side !== 'B') throw new Error('Side must be A or B.');
  validatePlayerStake({ amount, balance: p.coins, openCount: playerOpenCount(guildId, discordId) });
  updatePlayer(discordId, { coins: p.coins - amount });
  const r = getDb().prepare(`INSERT INTO wagers (guild_id, global_id, kind, backer_id, side, amount, anonymous) VALUES (?,?,?,?,?,?,?)`)
    .run(guildId, globalId, 'player', discordId, side, amount, 0);
  return r.lastInsertRowid;
}

export function placeAnonymousPlayerWager(guildId, globalId, discordId, side, amount) {
  const id = placePlayerWager(guildId, globalId, discordId, side, amount);
  getDb().prepare('UPDATE wagers SET anonymous = 1 WHERE id = ?').run(id);
  return id;
}

// Constellation seed wagers when a global scenario opens: the audience reacts.
export function seedConstellationWagers(guildId, globalId, { votesA = 0, votesB = 0, rng = Math.random } = {}) {
  const wallets = getOrSeedWallets(guildId);
  const placed = [];
  for (const w of wallets) {
    const persona = PERSONA_OF[w.constellation_id];
    const decision = personaWager(persona, { influence: w.influence, poolA: 1, poolB: 1, votesA, votesB, rng });
    if (!decision) continue;
    if (decision.amount > w.balance) continue;
    lockStake(guildId, w.constellation_id, decision.amount, decision.influenceCost);
    getDb().prepare(`INSERT INTO wagers (guild_id, global_id, kind, backer_id, side, amount, anonymous) VALUES (?,?,?,?,?,?,?)`)
      .run(guildId, globalId, 'constellation', w.constellation_id, decision.side, decision.amount, persona === 'manipulative' ? 1 : 0);
    placed.push({ name: constellationName(w.constellation_id), side: decision.side, amount: decision.amount, anonymous: persona === 'manipulative' });
  }
  return placed;
}

// OPEN -> LOCKED -> WIN/LOSE -> PAYOUT + WORLD EVENT data.
export function settleGlobalWagers(guildId, globalId, winner) {
  const db = getDb();
  const open = openWagers(guildId, globalId);
  db.prepare(`UPDATE wagers SET status = 'locked' WHERE guild_id = ? AND global_id = ? AND status = 'open'`).run(guildId, globalId);
  const results = settleWagers(open, winner);
  const byId = new Map(open.map((w) => [w.id, w]));
  const payouts = [];
  for (const r of results) {
    const w = byId.get(r.id);
    db.prepare('UPDATE wagers SET status = ? WHERE id = ?').run(r.status, r.id);
    if (w.kind === 'player') {
      if (r.status === 'won' || r.status === 'refunded') {
        const p = getPlayer(w.backer_id);
        // High Rollers take a little more off the top.
        const boost = r.status === 'won' ? perksFor(w.backer_id, { always: true }).wager : 0;
        const payout = r.status === 'won' ? Math.floor(r.payout * (1 + boost / 100)) : r.payout;
        if (p) updatePlayer(w.backer_id, { coins: p.coins + payout });
      }
      payouts.push({ ...w, ...r });
    } else if (r.status === 'won') {
      releaseEscrow(guildId, w.backer_id, w.amount, r.payout);
      payouts.push({ ...w, ...r, profit: r.payout - w.amount });
    } else if (r.status === 'refunded') {
      refundEscrow(guildId, w.backer_id, w.amount);
      payouts.push({ ...w, ...r });
    } else {
      // lost: stake already left the balance at lock time; clear escrow booking
      db.prepare('UPDATE constellation_wallets SET escrow = escrow - ? WHERE guild_id = ? AND constellation_id = ?')
        .run(w.amount, guildId, w.backer_id);
      payouts.push({ ...w, ...r });
    }
  }
  const pools = poolTotals(open);
  return { payouts, pools, underdog: isUnderdogWin(open, winner), total: open.length };
}

export { poolTotals };
