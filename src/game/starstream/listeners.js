import { on } from '../events/bus.js';
import { getChannel, bumpChannel, recordReaction, getInterest, addInterest, topInterests, logIntervention, recordGlobalEvent } from './store.js';
import { interestDeltaFor, reactionFlavor } from './attention.js';
import { excitementDeltaFor, channelValueFor } from './economy.js';
import { disturbanceDeltaFor, pressureLevel, pressureLine } from './pressure.js';
import { commentFor, hostFor } from './dokkaebis.js';
import { giftOffer, empowerOffer } from './interventions.js';
import { getWallet, constellationName } from '../constellations/wallets.js';
import { PERSONA_OF } from '../constellations/personas.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { addFavor, activeContract } from '../sponsors/contracts.js';
import { recordEvent } from '../world/store.js';
import { getDb } from '../../database/db.js';

const REACTION_FOR = {
  gambit: 'excited', underdog: 'excited', clash: 'fascinating', duel: 'fascinating',
  collision: 'curious', altered: 'curious', sponsor_signed: 'fascinating', sponsor_broken: 'outraged',
  defer: 'displeased', refund: 'displeased', secret: 'curious', intervention: 'excited',
};

function involvedConstellations(payload) {
  const ids = [];
  if (payload.constellationId) ids.push(payload.constellationId);
  if (payload.winner && !['A', 'B'].includes(payload.winner)) ids.push(payload.winner);
  if (payload.loser && !['A', 'B'].includes(payload.loser)) ids.push(payload.loser);
  if (payload.playerId) {
    const c = activeContract(payload.playerId);
    if (c && !ids.includes(c.constellation_id)) ids.push(c.constellation_id);
  }
  return [...new Set(ids)];
}

// The spectacle: every notable event moves meters, attention, wallets, and the feed.
export function spectacle(guildId, kind, payload = {}) {
  if (!guildId || guildId === 'dm') return;
  const before = getChannel(guildId);
  const beforeLevel = pressureLevel(before.disturbance);
  const channel = bumpChannel(guildId, { excitement: excitementDeltaFor(kind), disturbance: disturbanceDeltaFor(kind) });

  // Constellations react — the involved most of all.
  const involved = involvedConstellations(payload);
  const reactors = involved.length ? involved : topInterests(guildId, 2).map((r) => r.constellation_id);
  for (const cid of reactors) {
    const interest = addInterest(guildId, cid, interestDeltaFor(kind));
    recordReaction(guildId, REACTION_FOR[kind] || 'curious', cid, kind);
    maybeIntervene(guildId, cid, payload.playerId);
  }

  // Dokkaebi amplifies what it loves (recorded — the feed is the broadcast).
  const quip = commentFor(hostFor(guildId), kind, Math.random);
  if (quip) recordEvent(guildId, { kind: 'broadcast', actorId: null, summary: `🎙️ ${quip}` });

  // Pressure warnings change the weather, not the outcome — and the universe hears them.
  const afterLevel = pressureLevel(channel.disturbance);
  if (afterLevel === 'warning' && beforeLevel !== 'warning') {
    recordEvent(guildId, { kind: 'world_event', actorId: null, summary: pressureLine('warning') });
    recordGlobalEvent({ kind: 'disturbance', summary: `📡 Server ${guildId} caused an unprecedented probability disturbance. Global attention shifts toward it.`, originGuild: guildId });
  }

  // Channel value follows the noise.
  const wagerCount = getDb().prepare('SELECT COUNT(*) v FROM wagers WHERE guild_id = ?').get(guildId).v;
  const players = getDb().prepare('SELECT COUNT(*) v FROM players').get().v;
  const collisions = getDb().prepare(`SELECT COUNT(*) v FROM chapter_collisions WHERE guild_id = ? AND status = 'open'`).get(guildId).v;
  bumpChannel(guildId, { value: channelValueFor({ excitement: channel.excitement, wagers: wagerCount, participants: players, collisions }) });
}

function maybeIntervene(guildId, constellationId, playerId) {
  if (!playerId || !getPlayer(playerId)) return;
  const wallet = getWallet(guildId, constellationId);
  const interest = getInterest(guildId, constellationId);
  const empower = empowerOffer(interest, wallet.balance);
  if (empower) {
    getDb().prepare('UPDATE constellation_wallets SET balance = balance - ? WHERE guild_id = ? AND constellation_id = ?').run(empower.coins, guildId, constellationId);
    const p = getPlayer(playerId);
    updatePlayer(playerId, { coins: p.coins + empower.coins });
    addFavor(playerId, constellationId, empower.favor);
    addInterest(guildId, constellationId, -20);
    logIntervention(guildId, constellationId, 'empower', empower.coins, playerId, `${constellationName(constellationId)} empowered ${p.name}.`);
    recordEvent(guildId, { kind: 'intervention', actorId: playerId, summary: `⭐ ${constellationName(constellationId)} EMPOWERS ${p.name} (+${empower.coins} coins, favor +${empower.favor}). ${reactionFlavor(PERSONA_OF[constellationId], 'intervention')}.` });
    return;
  }
  const gift = giftOffer(interest, wallet.balance);
  if (gift) {
    getDb().prepare('UPDATE constellation_wallets SET balance = balance - ? WHERE guild_id = ? AND constellation_id = ?').run(gift.coins, guildId, constellationId);
    const p = getPlayer(playerId);
    updatePlayer(playerId, { coins: p.coins + gift.coins });
    addInterest(guildId, constellationId, -gift.interestCost);
    logIntervention(guildId, constellationId, 'gift', gift.coins, playerId, `${constellationName(constellationId)} gifted ${p.name}.`);
    recordEvent(guildId, { kind: 'intervention', actorId: playerId, summary: `🎁 ${constellationName(constellationId)} sends ${p.name} ${gift.coins} coins. The audience approves.` });
  }
}

export function registerSpectacleListeners() {
  if (registerSpectacleListeners.done) return;
  registerSpectacleListeners.done = true;
  on('scenario_cleared', ({ guildId, playerId }) => spectacle(guildId, 'clear', { playerId }));
  on('scenario_altered', ({ guildId, playerId }) => spectacle(guildId, 'altered', { playerId }));
  on('sponsor_signed', (p) => spectacle(p.guildId, 'sponsor_signed', { playerId: p.playerId, constellationId: p.constellationId }));
  on('sponsor_broken', (p) => spectacle(p.guildId, 'sponsor_broken', { playerId: p.playerId, constellationId: p.constellationId }));
  on('combat_finished', ({ guildId, kind }) => spectacle(guildId, kind === 'pve' || kind === 'pvp' ? 'clear' : kind, {}));
  on('constellation_intervened', ({ guildId, winner, loser }) => spectacle(guildId, 'intervention', { winner, loser }));
  on('party_synergy', ({ guildId, pair }) => spectacle(guildId, 'synergy', { playerId: pair?.[0] }));
  on('probability_disturbed', ({ guildId, playerId }) => spectacle(guildId, 'gambit', { playerId }));
  on('wager_settled', ({ guildId }) => spectacle(guildId, 'wager_settled', {}));
  on('stigma_evolved', ({ guildId, playerId }) => spectacle(guildId, 'stigma_evolved', { playerId }));
}
