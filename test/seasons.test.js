import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-season-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { activeSeason, seasonStatus, scoreServers, closeSeason, listSeasons } = await import('../src/game/seasons/season.js');
const { generateChapter } = await import('../src/game/scenarios/generator.js');

getDb();
const [season] = listSeasons();

test('seasons resolve by date', () => {
  assert.equal(activeSeason(new Date('2026-09-15').getTime()).id, 'season_001');
  assert.equal(activeSeason(new Date('2026-01-01').getTime()), null);
  assert.equal(activeSeason(new Date('2027-01-01').getTime()), null);
  assert.equal(seasonStatus(season, new Date('2026-09-15').getTime()).state, 'open');
});

test('scoring weighs recorded history', () => {
  const board = scoreServers(season, [
    { guildId: 'quiet', events: 10, alters: 0, clears: 5, wagers: 0, chapters: 1 },
    { guildId: 'loud', events: 4, alters: 2, clears: 1, wagers: 10, chapters: 0 },
  ]);
  // loud: 4 + 10 + 2 + 20 = 36; quiet: 10 + 0 + 10 + 0 + 3 = 23
  assert.equal(board[0].guildId, 'loud');
  assert.equal(board[1].guildId, 'quiet');
  assert.deepEqual(scoreServers(season, []), []);
});

test('premise rides into chapters without touching history', () => {
  const snap = { clears: 0, alters: 0, flags: {}, relations: {}, seasonPremise: 'P', seasonName: 'S' };
  const ch = generateChapter(3, snap);
  assert.ok(ch.brief[0].includes('SEASON'));
  const plain = generateChapter(3, { clears: 0, alters: 0, flags: {}, relations: {} });
  assert.ok(!plain.brief.some((b) => b.includes('SEASON')));
});

test('close awards once, then never again', () => {
  const db = getDb();
  db.prepare('INSERT INTO world_events (guild_id, kind, actor_id, summary) VALUES (?,?,?,?)').run('s1', 'scenario_clear', 'p1', 'x');
  db.prepare('INSERT INTO chapter_instances (guild_id, chapter_no, data) VALUES (?,?,?)').run('s1', 3, '{}');
  const chapterId = db.prepare('SELECT id FROM chapter_instances WHERE guild_id=?').get('s1').id;
  db.prepare('INSERT INTO chapter_participants (chapter_id, discord_id, choice) VALUES (?,?,?)').run(chapterId, 'p1', 'confront');
  db.prepare('INSERT INTO players (discord_id, name) VALUES (?,?)').run('p1', 'P1');
  const first = closeSeason('season_001');
  assert.ok(first.winners.length >= 1);
  assert.ok(db.prepare('SELECT card_id FROM story_cards WHERE discord_id=?').all('p1').some((r) => r.card_id.startsWith('season_season_001')));
  const second = closeSeason('season_001');
  assert.ok(second.already);
  assert.throws(() => closeSeason('nope'), /No such season/);
});
