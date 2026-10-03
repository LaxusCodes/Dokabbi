import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCommands, deployCommands } from '../src/deploy.js';
import { textOf, V2 } from '../src/utils/v2.js';

test('every command module loads and registers', async () => {
  const commands = await collectCommands();
  assert.ok(commands.length >= 30, `expected 30+ commands, got ${commands.length}`);
  const names = commands.map((c) => c.name);
  for (const need of ['register', 'status', 'scenario', 'pve', 'chapter', 'auction', 'market', 'sponsor', 'tutorial']) {
    assert.ok(names.includes(need), `missing /${need}`);
  }
});

test('deploy fails loudly with clear guidance, never obscurely', async () => {
  // Test env has no real token/client id, so this must throw a helpful error.
  await assert.rejects(deployCommands, /DISCORD_TOKEN|CLIENT_ID/);
});

test('v2 payloads carry no banned keys', async () => {
  const { panel, verr, artPanel } = await import('../src/utils/v2.js');
  for (const payload of [panel({ title: 't', body: 'b' }), verr('nope'), artPanel({ title: 't', body: 'b', image: null })]) {
    assert.equal(payload.flags, V2);
    assert.ok(!('content' in payload) && !('embeds' in payload));
    assert.ok(textOf(payload).length > 0);
  }
});
