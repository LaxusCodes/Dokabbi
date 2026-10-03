import test from 'node:test';
import assert from 'node:assert/strict';
import { featuredPick, trendingText, universeOverview } from '../src/game/starstream/global.js';
import { entryVisibleTo } from '../src/game/knowledge/permissions.js';
import { validateShareScope } from '../src/game/knowledge/system.js';
import { generateChapter } from '../src/game/scenarios/generator.js';

test('featured channel goes to the hottest server', () => {
  const servers = [
    { guildId: 'calm', excitement: 10, disturbance: 0, alters: 0, collisions: 0 },
    { guildId: 'storm', excitement: 40, disturbance: 50, alters: 2, collisions: 1 },
  ];
  assert.equal(featuredPick(servers).guildId, 'storm');
  assert.equal(featuredPick([]), null);
  const text = trendingText({ servers: [{ guildId: 'storm', headline: 'A duel', attention: 90 }], events: [], featured: servers[1] });
  assert.ok(text.includes('TRENDING') && text.includes('Featured Channel'));
});

test('universe shows global nebulas', () => {
  const text = universeOverview({
    servers: [], constellations: [], events: [],
    nebulas: [{ name: 'Iron Gate', servers: [{ guild: 'A', members: 3 }, { guild: 'B', members: 1 }] }],
  });
  assert.ok(text.includes('Iron Gate') && text.includes('2 server(s)'));
});

test('global knowledge crosses servers', () => {
  assert.equal(validateShareScope('global'), 'global');
  const ctx = { sameParty: false, sameNebula: false };
  assert.ok(entryVisibleTo({ scope: 'global' }, 'viewer', 'owner', ctx));
  assert.ok(!entryVisibleTo({ scope: 'nebula' }, 'viewer', 'owner', ctx));
  assert.ok(entryVisibleTo({ scope: 'public' }, 'viewer', 'owner', ctx));
});

test('other servers echo into new chapters', () => {
  const snap = { clears: 0, alters: 0, flags: {}, relations: {}, globalRipples: [{ kind: 'duel', summary: 'A duel shook Server B.' }] };
  const ch = generateChapter(3, snap);
  assert.ok(ch.brief.some((b) => b.includes('Elsewhere in the Stream')));
  const quiet = generateChapter(3, { clears: 0, alters: 0, flags: {}, relations: {} });
  assert.ok(!quiet.brief.some((b) => b.includes('Elsewhere')));
});
