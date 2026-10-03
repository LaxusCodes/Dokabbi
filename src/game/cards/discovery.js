import { getDb } from '../../database/db.js';
import { mintStoryCard } from './mint.js';
import { computeDivergence } from '../canon/divergence.js';
import { recordEvent } from '../world/store.js';

// UNKNOWN RECORD DETECTED: the server wonders what it did. Pure conditions,
// then one award per chapter when the mystery completes.
export const DISCOVERY_DIVERGENCE = 40;
export const DISCOVERY_PARTICIPANTS = 3;
export const DISCOVERY_DISTURBANCE = 30;

export function discoveryStatus({ divergence = 0, participants = 0, disturbance = 0 } = {}) {
  const conditions = [
    { label: 'Major divergence', met: divergence >= DISCOVERY_DIVERGENCE },
    { label: `${DISCOVERY_PARTICIPANTS}+ participants`, met: participants >= DISCOVERY_PARTICIPANTS },
    { label: 'Probability disturbance', met: disturbance >= DISCOVERY_DISTURBANCE },
  ];
  const met = conditions.filter((c) => c.met).length;
  return { conditions, pct: Math.round((met / conditions.length) * 100), complete: met === conditions.length };
}

export function discoveryReward(chapterNo) {
  return {
    card_id: `discovery@${chapterNo}`,
    name: '[The Night the Stream Looked Twice]',
    scenario_id: `CH${chapterNo}`,
    effect: 'Something extremely unusual happened here, before enough witnesses. The Stream itself took note.',
    power: 6,
  };
}

// Called after chapter choices; awards once per chapter, then never again.
export function checkDiscovery(guildId, chapterNo) {
  const db = getDb();
  const flagKey = `discovery.${chapterNo}`;
  const done = db.prepare('SELECT value FROM server_flags WHERE guild_id = ? AND key = ?').get(guildId, flagKey)?.value;
  if (done) return null;
  const chapter = db.prepare('SELECT id FROM chapter_instances WHERE guild_id = ? AND chapter_no = ?').get(guildId, chapterNo);
  const participants = chapter ? db.prepare('SELECT DISTINCT discord_id FROM chapter_participants WHERE chapter_id = ?').all(chapter.id).map((r) => r.discord_id) : [];
  const disturbance = db.prepare('SELECT disturbance FROM channel_state WHERE guild_id = ?').get(guildId)?.disturbance || 0;
  const status = discoveryStatus({ divergence: computeDivergence(guildId).score, participants: participants.length, disturbance });
  if (!status.complete || !participants.length) return { status, awarded: false };
  const card = discoveryReward(chapterNo);
  for (const pid of participants) mintStoryCard(db, pid, card);
  db.prepare('INSERT INTO server_flags (guild_id, key, value) VALUES (?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=?')
    .run(guildId, flagKey, 'awarded', 'awarded');
  recordEvent(guildId, { kind: 'world_event', actorId: null, summary: `🌌 STAR STREAM DISCOVERY — **${card.name}** solved itself. Awarded to ${participants.length} witnesses.` });
  return { status, awarded: true, card, participants };
}
