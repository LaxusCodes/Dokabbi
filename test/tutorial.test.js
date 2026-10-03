import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, renderTutorialPage } from '../src/game/tutorial/pages.js';
import { textOf } from '../src/utils/v2.js';

test('tutorial is short, ordered, and reward-free', () => {
  assert.equal(PAGES.length, 8);
  const titles = PAGES.map((p) => p.title);
  for (const need of ['Your Life', 'Scenarios', 'Knowledge', 'Stories', 'Sponsors', 'Survival', 'Star Stream']) {
    assert.ok(titles.some((t) => t.includes(need.split(' ')[1]) || t === need), need);
  }
  const all = PAGES.map((p) => p.body).join('\n');
  assert.ok(!/\bcoins?\b|\bXP\b|\breward\b|\bexclusive\b|\bfree (item|coins|XP)\b/i.test(all));
  for (const cmd of ['/incarnation record', '/scenario', '/observe', '/journey', '/sponsor', '/pve', '/world stream']) {
    assert.ok(all.includes(cmd), cmd);
  }
});

test('pages render statelessly with bounds', () => {
  const first = renderTutorialPage(0);
  assert.ok(textOf(first).includes('Page 1/8') && first.ephemeral);
  assert.ok(textOf(renderTutorialPage(99)).includes('Page 8/8'));
  assert.ok(textOf(renderTutorialPage(-5)).includes('Page 1/8'));
  assert.ok(textOf(renderTutorialPage(7)).includes('awaits'));
});
