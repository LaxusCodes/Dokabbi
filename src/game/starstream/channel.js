// Channel overview + live feed, assembled from world_events (still the backbone). Pure.
import { hostFor } from './dokkaebis.js';

export function channelOverview({ chapterNo, branchCount, interests, excitement, disturbance, trending }) {
  const watching = interests.length;
  return [
    '📡 STAR STREAM', '',
    `Current Chapter: ${String(chapterNo).padStart(3, '0')}`,
    `Active Branches: ${branchCount}`,
    `Watching Constellations: ${watching}`,
    `Audience Excitement: ${excitement}%`,
    `Probability Disturbance: ${disturbance}%`,
    '',
    `🔥 TRENDING — ${trending || 'the stream waits for something worth watching'}`,
    '',
    '👁 Most Watched',
    ...interests.slice(0, 3).map((r, i) => `#${i + 1} ${r.name} — ${r.views} views`),
  ].join('\n');
}

export function feedLine(event, host) {
  const time = (event.created_at || '').slice(5, 16);
  return `${time} — ${event.summary}`;
}

export function liveFeed(events, guildId, limit = 12) {
  const host = hostFor(guildId);
  return ['📡 STAR STREAM — LIVE', `🎙️ Host: ${host.name} (${host.style})`, '',
    ...events.slice(-limit).map((e) => feedLine(e, host))].join('\n');
}

export { hostFor };
