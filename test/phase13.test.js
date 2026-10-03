import test from 'node:test';
import assert from 'node:assert/strict';
import { presenceView, breakingEventText, universeOverview } from '../src/game/starstream/global.js';

test('presence shows every watched server', () => {
  const text = presenceView({
    constellationName: 'Judge', influence: 63, renown: 2,
    servers: [
      { guildId: 'A', chapterNo: 4, interest: 81 },
      { guildId: 'B', chapterNo: 6, interest: 93 },
    ],
  });
  assert.ok(text.includes('Watching:') && text.includes('004') && text.includes('🔥') && text.includes('63'));
});

test('breaking events name the origin server', () => {
  const text = breakingEventText({ originGuild: 'B', summary: 'Unprecedented disturbance.', attentionGain: 18 });
  assert.ok(text.includes('BREAKING EVENT') && text.includes('B') && text.includes('+18%'));
});

test('universe overview stays readable when quiet', () => {
  const text = universeOverview({ servers: [], constellations: [], events: [] });
  assert.ok(text.includes('GLOBAL STAR STREAM') && text.includes('quiet'));
  const full = universeOverview({
    servers: [{ guildId: 'A', chapterNo: 3, events: 12 }],
    constellations: [{ name: 'Judge', influence: 70, renown: 3 }],
    events: [{ summary: 'A duel shook two servers.' }],
  });
  assert.ok(full.includes('003') && full.includes('70 / 3') && full.includes('duel'));
});
