// Stabilization suite: legacy migration, double-action guards, permission leaks,
// dedup, economy isolation, listener idempotency, restart persistence.
// Uses a throwaway database file — never touches data/starstream.db.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-stab-'));
const tmp = path.join(dir, 'test.db');
const legacyFile = path.join(dir, 'legacy.db');
process.env.DATABASE_PATH = tmp;

const { DatabaseSync } = await import('node:sqlite');
const { getDb, migrateDb } = await import('../src/database/db.js');
const { createPlayer, getPlayer } = await import('../src/game/players/model.js');
const { createParty, joinParty, getPlayerParty } = await import('../src/game/parties/store.js');
const { getOrCreateChapter, playerChapterCtx, chapterDisplay, decideChapter } = await import('../src/game/scenarios/director.js');
const { getOrCreateBranch } = await import('../src/game/scenarios/instances.js');
const { recordCollisions } = await import('../src/game/scenarios/collisions.js');
const { grantKnowledge, playerKnowledgeIds, setKnowledgeScope } = await import('../src/game/world/store.js');
const { visibleKnowledgeOf } = await import('../src/game/knowledge/permissions.js');
const { getWallet } = await import('../src/game/constellations/wallets.js');
const { joinNebula, memberOf } = await import('../src/game/nebulas/store.js');
const { registerNebulaListeners } = await import('../src/game/nebulas/events.js');
const { emit } = await import('../src/game/events/bus.js');
const { computeDivergence } = await import('../src/game/canon/divergence.js');
const { syncTeamCard } = await import('../src/game/cards/living.js');
const { die, retireLegacy, reincarnate, requireAlive } = await import('../src/game/incarnations/lifecycle.js');
const { assembleRecord, recordText } = await import('../src/game/incarnations/record.js');
const { dailyView, claimDaily, runEncounter } = await import('../src/game/daily/store.js');
const { setShowcase, showcaseOf, teamHistory } = await import('../src/game/cards/collection.js');
const { recruitCharacter } = await import('../src/game/cards/characters.js');
const { bumpCounter } = await import('../src/game/titles/counters.js');
const { evaluateTitles } = await import('../src/game/titles/evaluate.js');
const { setSlots: setTitleSlots, perksFor: perksCheck } = await import('../src/game/titles/perks.js');
const { equipCompanion: equipC, unequipCompanion: unequipC, getCompanion: getC, companionHistory: compHist } = await import('../src/game/cards/characters.js');
const { checkDiscovery } = await import('../src/game/cards/discovery.js');
const { leaveParty } = await import('../src/game/parties/store.js');
const { syncTeamCard: syncAgain } = await import('../src/game/cards/living.js');
const { textOf } = await import('../src/utils/v2.js');

getDb(); // migrate fresh temp db
const mk = [];
for (const id of ['uA', 'uB', 'uC', 'uD', 'uE', 'uF', 'uG', 'uH', 'uZ']) {
  mk.push(id);
  createPlayer(id, `Name_${id}`);
}
const mockInteraction = (uid, guildId) => {
  const captured = [];
  return { interaction: { guildId, user: { id: uid }, deferred: false, replied: false, reply: async (m) => { captured.push(textOf(m)); } }, captured };
};

test('legacy databases upgrade cleanly', () => {
  const legacy = new DatabaseSync(legacyFile);
  legacy.exec(`CREATE TABLE players (discord_id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO players (discord_id, name) VALUES ('old','Old');
    CREATE TABLE player_knowledge (discord_id TEXT, knowledge_id TEXT, PRIMARY KEY (discord_id, knowledge_id));
    CREATE TABLE nebula_members (nebula_id TEXT, discord_id TEXT, reputation INTEGER DEFAULT 0, PRIMARY KEY (nebula_id, discord_id));
    CREATE TABLE chapter_participants (chapter_id INTEGER, discord_id TEXT, choice TEXT, PRIMARY KEY (chapter_id, discord_id));`);
  legacy.close();
  migrateDb(new DatabaseSync(legacyFile));
  const db = new DatabaseSync(legacyFile);
  const tables = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name));
  for (const t of ['chapter_branches', 'chapter_collisions', 'constellation_global', 'global_events', 'character_memory', 'stigma_mastery', 'duels', 'wagers', 'sponsorships']) {
    assert.ok(tables.has(t), `missing table ${t}`);
  }
  const cols = (tbl) => db.prepare(`PRAGMA table_info(${tbl})`).all().map((r) => r.name);
  assert.ok(cols('player_knowledge').includes('shared_with'));
  assert.ok(cols('nebula_members').includes('guild_id'));
  assert.ok(cols('chapter_participants').includes('branch_id'));
  assert.equal(db.prepare('SELECT name FROM players WHERE discord_id=?').get('old').name, 'Old');
  db.close();
});

test('parties cap at five; sixth is refused', () => {
  const g = createParty('uA', 'Alpha');
  joinParty('uB', g.party.id);
  joinParty('uC', g.party.id);
  joinParty('uD', g.party.id);
  joinParty('uE', g.party.id);
  assert.throws(() => joinParty('uF', g.party.id), /full/);
  syncTeamCard(g.party.id, 'gtest');
  const cards = getDb().prepare('SELECT discord_id FROM story_cards WHERE card_id = ?').all(`team_${g.party.id}`).map((r) => r.discord_id);
  assert.deepEqual([...cards].sort(), ['uA', 'uB', 'uC', 'uD', 'uE']);
});

test('chapter double-decide is rejected', async () => {
  const chapter = getOrCreateChapter('gtest');
  const { interaction, captured } = mockInteraction('uF', 'gtest');
  await decideChapter(interaction, chapter, 'confront');
  assert.ok(captured.join('').includes('confront') || captured.join('').includes('chose'), captured.join('').slice(0, 200));
  const again = mockInteraction('uF', 'gtest');
  await decideChapter(again.interaction, chapter, 'confront');
  assert.ok(again.captured.join('').includes('already walked'));
});

test('late branches inherit locks from taken paths', async () => {
  grantKnowledge('uG', 'danger_east', 'test');
  grantKnowledge('uH', 'danger_east', 'test');
  // uH joins a party so its branch differs from the shared solo branch.
  const gp = createParty('uH', 'Beta');
  const chapter = getOrCreateChapter('glock');
  const g = mockInteraction('uG', 'glock');
  await decideChapter(g.interaction, chapter, 'eastern_route');
  assert.ok(g.captured.join('').includes('Slip onto'), g.captured.join('').slice(0, 300));
  void gp;
  const disp = chapterDisplay(chapter, playerChapterCtx('uH', 'glock'), getOrCreateBranch('glock', 3, `party:${gp.party.id}`), 'glock');
  assert.ok(disp.text.includes('🔒'), disp.text.slice(0, 500));
  const h = mockInteraction('uH', 'glock');
  await decideChapter(h.interaction, chapter, 'eastern_route');
  assert.ok(h.captured.join('').includes('no longer available'));
});

test('knowledge scopes do not leak', () => {
  grantKnowledge('uA', 'foreknow_001', 'test');
  assert.deepEqual(playerKnowledgeIds('uA'), expectIdsContaining('foreknow_001'));
  assert.equal(visibleKnowledgeOf('uB', 'uA', 'gtest').length, 0);
  setKnowledgeScope('uA', 'foreknow_001', 'public');
  assert.equal(visibleKnowledgeOf('uB', 'uA', 'gtest').length, 1);
  setKnowledgeScope('uA', 'foreknow_001', 'global');
  assert.equal(visibleKnowledgeOf('uB', 'uA', 'other-guild').length, 1);
  setKnowledgeScope('uA', 'foreknow_001', 'private');
  assert.equal(visibleKnowledgeOf('uB', 'uA', 'gtest').length, 0);
  function expectIdsContaining(id) {
    const ids = playerKnowledgeIds('uA');
    assert.ok(ids.includes(id));
    return ids;
  }
});

test('collisions dedupe on repeat detection', () => {
  const once = recordCollisions('gtest', 3, [{ branchA: 'party:X', pathA: 'protect', branchB: 'party:Y', pathB: 'ledger_cut', kind: 'conflicting_objectives' }]);
  assert.equal(once.length, 1);
  const twice = recordCollisions('gtest', 3, [{ branchA: 'party:Y', pathA: 'ledger_cut', branchB: 'party:X', pathB: 'protect', kind: 'conflicting_objectives' }]);
  assert.equal(twice.length, 0);
});

test('listener registration is idempotent across reloads', () => {
  joinNebula('uZ', 'iron_gate', 'gidem');
  registerNebulaListeners();
  registerNebulaListeners();
  registerNebulaListeners();
  emit('scenario_cleared', { guildId: 'gidem', playerId: 'uZ' });
  assert.equal(memberOf('uZ', 'gidem').reputation, 7); // 5 join + exactly one +2
});

test('economy is isolated per server', () => {
  const a = getWallet('g1', 'judge_embers');
  const b = getWallet('g2', 'judge_embers');
  getDb().prepare('UPDATE constellation_wallets SET balance = 1 WHERE guild_id = ? AND constellation_id = ?').run('g1', 'judge_embers');
  assert.equal(getDb().prepare('SELECT balance FROM constellation_wallets WHERE guild_id=? AND constellation_id=?').get('g2', 'judge_embers').balance, b.balance);
  assert.equal(getDb().prepare('SELECT balance FROM constellation_wallets WHERE guild_id=? AND constellation_id=?').get('g1', 'judge_embers').balance, 1);
});

test('divergence recalculates identically', () => {
  const d1 = computeDivergence('gtest');
  const d2 = computeDivergence('gtest');
  assert.deepEqual(d1, d2);
});

test('anomaly marks once per chapter, then ripples globally', async () => {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO server_flags (guild_id, key, value) VALUES (?,?,?)').run('ganom', 'faction.survivor_community', 'formed');
  db.prepare('INSERT OR REPLACE INTO server_flags (guild_id, key, value) VALUES (?,?,?)').run('ganom', 'area.east', 'entered');
  db.prepare('INSERT INTO npc_trust (guild_id, npc_id, discord_id, trust) VALUES (?,?,?,?) ON CONFLICT(guild_id,npc_id,discord_id) DO UPDATE SET trust=?').run('ganom', 'survivor_17', 'uA', 20, 20);
  db.prepare('INSERT INTO scenario_instances (guild_id, scenario_id, altered) VALUES (?,?,1)').run('ganom', '001');
  db.prepare('INSERT INTO scenario_instances (guild_id, scenario_id, altered) VALUES (?,?,1)').run('ganom', '002');
  const before = db.prepare('SELECT COUNT(*) v FROM global_events').get().v;
  getOrCreateChapter('ganom');
  getOrCreateChapter('ganom');
  const flags = db.prepare('SELECT value FROM server_flags WHERE guild_id=? AND key=?').get('ganom', 'canon.anomaly.3')?.value;
  assert.equal(flags, 'marked');
  assert.equal(db.prepare('SELECT COUNT(*) v FROM global_events').get().v, before + 1);
});

test('restart persistence: a fresh handle sees everything', () => {
  const fresh = new DatabaseSync(tmp);
  assert.ok(fresh.prepare('SELECT COUNT(*) v FROM players').get().v >= 9);
  assert.ok(fresh.prepare(`SELECT COUNT(*) v FROM chapter_instances WHERE guild_id='gtest'`).get().v >= 1);
  fresh.close();
  assert.ok(getPlayer('uA').name === 'Name_uA');
  assert.ok(getPlayerParty('uA')?.party.id);
});

test('death ends agency; legacy chooses what survives', () => {
  createPlayer('uL', 'Name_uL');
  getDb().prepare('UPDATE players SET level = 5 WHERE discord_id = ?').run('uL');
  getDb().prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run('uL', 'merciful_survivor');
  assert.equal(requireAlive(getPlayer('uL')), null);
  assert.ok(die('uL', 'gtest', 'a failed gambit against the Husk'));
  assert.equal(getPlayer('uL').status, 'fallen');
  assert.ok(requireAlive(getPlayer('uL')).includes('fallen'));
  assert.ok(getDb().prepare('SELECT story_id FROM player_stories WHERE discord_id=?').all('uL').some((r) => r.story_id === 'fallen_legend'));
  const text = recordText(assembleRecord('uL', 'gtest'));
  assert.ok(text.includes('fallen') && text.includes('The Fall of Name_uL'));
  const r = reincarnate('uL', 'merciful_survivor');
  assert.equal(r.kept, 'merciful_survivor');
  const p = getPlayer('uL');
  assert.equal(p.status, 'alive');
  assert.equal(p.level, 1);
  assert.equal(requireAlive(p), null);
  const stories = getDb().prepare('SELECT story_id FROM player_stories WHERE discord_id=?').all('uL').map((x) => x.story_id);
  assert.ok(stories.includes('merciful_survivor') && stories.includes('fallen_legend'));
  assert.throws(() => reincarnate('uL', 'merciful_survivor'), /Only the fallen/);
  assert.throws(() => reincarnate('uL', 'nope'), /Only the fallen/);
});

test('retirement needs a life worth remembering', () => {
  createPlayer('uM', 'Name_uM');
  assert.throws(() => retireLegacy('uM', 'gtest'), /level 3/);
  getDb().prepare('UPDATE players SET level = 4 WHERE discord_id = ?').run('uM');
  assert.ok(retireLegacy('uM', 'gtest'));
  assert.equal(getPlayer('uM').status, 'vanished');
});

test('daily check-in advances streaks; missions pay from real acts', () => {
  createPlayer('uD1', 'Name_uD1');
  const v0 = dailyView('uD1');
  assert.equal(v0.missions.length, 4);
  assert.ok(!v0.checkin);
  const c1 = claimDaily('uD1', 'gtest');
  assert.ok(c1.lines.join('').includes('Day 1'));
  assert.equal(c1.streak, 1);
  const c2 = claimDaily('uD1', 'gtest'); // same day: no double check-in
  assert.ok(!c2.lines.join('').includes('Day 1 check-in'));
  // A real act completes a real mission.
  getDb().prepare(`INSERT INTO scenario_log (discord_id, scenario_id, choice, outcome, coins, created_at) VALUES (?,?,?,?,?,datetime('now'))`).run('uD1', '001', 'help', 'success', 10);
  const v1 = dailyView('uD1');
  const clear = v1.missions.find((m) => m.id === 'clear');
  assert.ok(clear.done);
  const c3 = claimDaily('uD1', 'gtest');
  assert.ok(c3.lines.join('').includes('+150 coins'));
});

test('encounters cost energy and move the world', () => {
  createPlayer('uD2', 'Name_uD2');
  const before = getPlayer('uD2').energy;
  const lines = runEncounter('uD2', 'gtest', false, () => 0.01);
  assert.ok(lines.length > 0);
  assert.equal(getPlayer('uD2').energy, before - 10);
  getDb().prepare('UPDATE players SET energy = 0 WHERE discord_id = ?').run('uD2');
  assert.throws(() => runEncounter('uD2', 'gtest'), /exhausted/);
});

test('leaving updates the living card but preserves history', () => {
  createPlayer('uT1', 'Name_uT1');
  createPlayer('uT2', 'Name_uT2');
  const g = createParty('uT1', 'Gamma');
  joinParty('uT2', g.party.id);
  syncAgain(g.party.id, 'gtest');
  leaveParty('uT1', 'gtest');
  syncAgain(g.party.id, 'gtest');
  const live = getDb().prepare('SELECT effect FROM story_cards WHERE card_id = ? AND discord_id = ?').get(`team_${g.party.id}`, 'uT2').effect;
  assert.ok(!live.includes('Name_uT1') && live.includes('Name_uT2'));
  const hist = teamHistory(`team_${g.party.id}`);
  assert.ok(hist.length >= 2);
  assert.ok(hist[0].members.includes('Name_uT1') && hist[0].members.includes('Name_uT2'));
  assert.ok(hist[hist.length - 1].members.includes('Name_uT2'));
});

test('showcases flex only earned cards', () => {
  const card = getDb().prepare('SELECT card_id FROM story_cards WHERE discord_id = ? LIMIT 1').get('uT2').card_id;
  setShowcase('uT2', card, 0);
  assert.ok(showcaseOf('uT2').some((r) => r.card_id === card));
  assert.throws(() => setShowcase('uT2', 'imaginary@x', 1), /earned/);
  assert.throws(() => setShowcase('uT2', card, 9), /4/);
});

test('discovery awards once, then never again', async () => {
  const db = getDb();
  // Anti-spam cooldowns are per-player global — clear them so reused test users aren't gated.
  db.prepare(`DELETE FROM cooldowns WHERE discord_id IN ('uD','uE','uF')`).run();
  db.prepare('INSERT OR REPLACE INTO server_flags (guild_id, key, value) VALUES (?,?,?)').run('gdisc', 'faction.survivor_community', 'formed');
  db.prepare('INSERT OR REPLACE INTO server_flags (guild_id, key, value) VALUES (?,?,?)').run('gdisc', 'area.east', 'entered');
  db.prepare('INSERT INTO npc_trust (guild_id, npc_id, discord_id, trust) VALUES (?,?,?,?) ON CONFLICT(guild_id,npc_id,discord_id) DO UPDATE SET trust=?').run('gdisc', 'survivor_17', 'uD', 20, 20);
  db.prepare('INSERT INTO channel_state (guild_id, excitement, disturbance, channel_value) VALUES (?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET disturbance=?').run('gdisc', 50, 40, 30, 40);
  const chapter = getOrCreateChapter('gdisc');
  for (const uid of ['uD', 'uE', 'uF']) {
    const m = mockInteraction(uid, 'gdisc');
    await decideChapter(m.interaction, chapter, 'confront');
  }
  const flag = db.prepare('SELECT value FROM server_flags WHERE guild_id=? AND key=?').get('gdisc', 'discovery.3')?.value;
  assert.equal(flag, 'awarded');
  assert.ok(db.prepare('SELECT card_id FROM story_cards WHERE discord_id=? AND card_id=?').get('uD', 'discovery@3'));
  assert.equal(checkDiscovery('gdisc', 3), null);
});

test('recruiting spends coins, never duplicates, shows in collection', () => {
  createPlayer('uR', 'Name_uR');
  getDb().prepare('UPDATE players SET coins = 100000 WHERE discord_id = ?').run('uR');
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const def = recruitCharacter('uR', () => Math.random());
    assert.ok(!seen.has(def.id), `duplicate recruit: ${def.id}`);
    seen.add(def.id);
  }
  assert.ok(getPlayer('uR').coins < 100000);
  const rows = getDb().prepare('SELECT card_id FROM story_cards WHERE discord_id = ?').all('uR');
  assert.equal(rows.length, seen.size);
});

test('companion killer flow: recruit, equip, fight, skill fires, history kept', async () => {
  createPlayer('uK', 'Name_uK');
  getDb().prepare('UPDATE players SET coins = 50000, level = 5, str = 12, agi = 12, mag = 12 WHERE discord_id = ?').run('uK');
  const def = recruitCharacter('uK', () => 0.99); // top of the pool
  // Equip requires ownership; strangers are refused.
  assert.throws(() => equipC('uB', def.id), /Recruit them first/);
  equipC('uK', def.id);
  assert.equal(getC('uK').id, def.id);
  // Re-equipping replaces (one slot); unequip clears.
  unequipC('uK');
  assert.equal(getC('uK'), null);
  equipC('uK', def.id);
  // Fight: import the real pve path pieces (command needs Discord; engine path identical).
  const { buildCombatantFromPlayer, monsterToCombatant } = await import('../src/game/combat/fromPlayer.js');
  const { companionCombatant, companionOpening } = await import('../src/game/combat/companions.js');
  const { runBattle } = await import('../src/game/combat/engine.js');
  const me = getPlayer('uK');
  const sideA = [buildCombatantFromPlayer({ ...me, role: 'Damage' }, { role: 'Damage', team: 'A', partyMembers: [] })];
  const comp = companionCombatant(def, 'A');
  sideA.push(comp);
  const foe = monsterToCombatant({ id: 'lurker', name: 'Lurker', hp: 40, power: 12, tier: 1 }, { team: 'B' });
  const opening = companionOpening(comp, sideA, [foe], def, () => 0.5);
  assert.equal(opening.entries.length, 1); // skill activates, round 0
  const r = runBattle(sideA, [foe], { scenarioTier: 1, rng: () => 0.5 });
  assert.ok(['A', 'B'].includes(r.winner));
  const { recordCompanionFight } = await import('../src/game/cards/characters.js');
  recordCompanionFight('uK', def.id, { victory: r.winner === 'A', playerName: 'Name_uK' });
  const hist = compHist('uK', def.id);
  assert.equal(hist.uses, 1);
  assert.equal(hist.victories + hist.defeats, 1);
  // Rebirth wipes the slot but keeps the history.
  const { reincarnate } = await import('../src/game/incarnations/lifecycle.js');
  getDb().prepare('UPDATE players SET status = ? WHERE discord_id = ?').run('fallen', 'uK');
  getDb().prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run('uK', 'merciful_survivor');
  reincarnate('uK', 'merciful_survivor');
  assert.equal(getC('uK'), null);
  assert.ok(compHist('uK', def.id).uses >= 1);
});

test('companions progress: bond, mastery, trust — and death costs trust', async () => {
  const { recordCompanionFight: record } = await import('../src/game/cards/characters.js');
  createPlayer('uP', 'Name_uP');
  getDb().prepare('UPDATE players SET coins = 50000 WHERE discord_id = ?').run('uP');
  const def = recruitCharacter('uP', () => 0.01); // low roll: common ally
  equipC('uP', def.id);
  record('uP', def.id, { victory: true, playerName: 'Name_uP' });
  record('uP', def.id, { victory: true, gambitWin: true, playerName: 'Name_uP' });
  record('uP', def.id, { victory: false, playerName: 'Name_uP' });
  let hist = compHist('uP', def.id);
  assert.equal(hist.uses, 3);
  assert.equal(hist.mastery, 2); // wins only
  assert.equal(hist.bond, 3 + 3 + 2 + 1); // win, win+gambit, loss
  assert.equal(hist.trust, 10 + 2 + 2 + 1); // started at 10
  record('uP', def.id, { victory: false, playerName: 'Name_uP', ownerDied: true });
  hist = compHist('uP', def.id);
  assert.equal(hist.trust, 5); // 15 - 10, abandonment stings
  assert.ok(hist.bond >= 0);
});

test('titles are earned from acts, equipped with teeth', () => {
  createPlayer('uT', 'Name_uT');
  bumpCounter('uT', 'gambit_wins', 3);
  bumpCounter('uT', 'observes', 10);
  const { fresh } = evaluateTitles('uT', 'gtest');
  const ids = fresh.map((d) => d.id);
  assert.ok(ids.includes('defier') && ids.includes('watcher'));
  // Announced to the world once.
  const again = evaluateTitles('uT', 'gtest');
  assert.equal(again.fresh.length, 0);
  assert.ok(getDb().prepare("SELECT summary FROM world_events WHERE actor_id=? AND summary LIKE '%👑%'").all('uT').length >= 1);
  setTitleSlots('uT', { primary: 'defier', secondary1: 'watcher' });
  // Defier reward 5 (gambit ctx) + Watcher energy 1 halved.
  assert.equal(perksCheck('uT', { always: true, gambit: true }).reward, 5);
  assert.equal(perksCheck('uT', { always: true }).energy, 0.5);
  assert.throws(() => setTitleSlots('uT', { primary: 'butcher' }), /Unearned/);
});
