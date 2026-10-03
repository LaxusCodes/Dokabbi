// World snapshot: everything the Director may read. History is input, never rewritten.
import { getDb } from '../../database/db.js';
import { allFlags } from '../world/store.js';
import { getDokja } from '../canon/store.js';
import { getChannel } from '../starstream/store.js';
import { computeDivergence } from '../canon/divergence.js';
import { activeSeason } from '../seasons/season.js';

export function readWorldSnapshot(guildId) {
  const db = getDb();
  const flags = allFlags(guildId);
  const clears = db.prepare(`SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND kind = 'scenario_clear'`).get(guildId).v;
  const alters = db.prepare(`SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1`).get(guildId).v;
  const bonds = db.prepare(`SELECT COUNT(*) v FROM bond_counters WHERE guild_id = ? AND honored = 1`).get(guildId).v;
  const sponsors = db.prepare(`SELECT COUNT(*) v FROM sponsorships WHERE guild_id = ? AND status = 'active'`).get(guildId).v;
  const wagers = db.prepare(`SELECT COUNT(*) v FROM wagers WHERE guild_id = ?`).get(guildId).v;
  const agendas = db.prepare(`SELECT COUNT(*) v FROM nebula_secrets WHERE guild_id = ?`).get(guildId).v;
  const relations = {};
  const relRows = db.prepare('SELECT nebula_a, nebula_b, state FROM nebula_relationships WHERE guild_id = ?').all(guildId);
  for (const r of relRows) relations[`${r.nebula_a}|${r.nebula_b}`] = r.state;
  if (!relations['iron_gate|veiled_ledger'] && !relations['veiled_ledger|iron_gate']) {
    relations['iron_gate|veiled_ledger'] = 'Competitive'; // seeded default
  }
  const chaptersDone = db.prepare(`SELECT COUNT(*) v FROM chapter_instances WHERE guild_id = ?`).get(guildId).v;
  const channel = getChannel(guildId);
  const ripples = db.prepare('SELECT kind, summary FROM global_events WHERE origin_guild IS NULL OR origin_guild != ? ORDER BY id DESC LIMIT 3').all(guildId);
  const divergence = computeDivergence(guildId);
  const season = activeSeason();
  return {
    chapterNo: 3 + chaptersDone,
    clears, alters, bonds, sponsors, wagers, agendas,
    flags,
    relations,
    dokjaAttention: getDokja(guildId).attention,
    disturbance: channel.disturbance,
    channelValue: channel.channel_value,
    globalRipples: ripples,
    divergence: divergence.score,
    divergenceBand: divergence.band,
    seasonPremise: season ? season.premise : null,
    seasonName: season ? season.name : null,
  };
}
