import { getDb } from '../../database/db.js';
import constellations from '../../../data/constellations.json' with { type: 'json' };

const START_BALANCE = 20000;
const START_INFLUENCE = 60;

export function constellationName(id) {
  return constellations.find((c) => c.id === id)?.name || id;
}

export function getOrSeedWallets(guildId) {
  const db = getDb();
  const seed = db.prepare('INSERT OR IGNORE INTO constellation_wallets (guild_id, constellation_id, balance, influence) VALUES (?,?,?,?)');
  for (const c of constellations) seed.run(guildId, c.id, START_BALANCE, START_INFLUENCE);
  return db.prepare('SELECT * FROM constellation_wallets WHERE guild_id = ?').all(guildId);
}

export function getWallet(guildId, constellationId) {
  getOrSeedWallets(guildId);
  return getDb().prepare('SELECT * FROM constellation_wallets WHERE guild_id = ? AND constellation_id = ?').get(guildId, constellationId);
}

// Escrow: stake leaves the balance immediately so it cannot be spent twice.
export function lockStake(guildId, constellationId, amount, influenceCost = 0) {
  const w = getWallet(guildId, constellationId);
  if (amount > w.balance) throw new Error(`${constellationName(constellationId)} cannot cover ${amount} (balance ${w.balance}).`);
  if (w.influence < 10) throw new Error(`${constellationName(constellationId)} lacks the influence to wager.`);
  getDb().prepare('UPDATE constellation_wallets SET balance = balance - ?, escrow = escrow + ?, influence = MAX(0, influence - ?) WHERE guild_id = ? AND constellation_id = ?')
    .run(amount, amount, influenceCost, guildId, constellationId);
}

export function releaseEscrow(guildId, constellationId, staked, payout) {
  // Loser: escrow already left the balance — just clear it. Winner: stake back + profit.
  getDb().prepare('UPDATE constellation_wallets SET escrow = escrow - ?, balance = balance + ? WHERE guild_id = ? AND constellation_id = ?')
    .run(staked, payout, guildId, constellationId);
}

export function refundEscrow(guildId, constellationId, staked) {
  getDb().prepare('UPDATE constellation_wallets SET escrow = escrow - ?, balance = balance + ? WHERE guild_id = ? AND constellation_id = ?')
    .run(staked, staked, guildId, constellationId);
}
