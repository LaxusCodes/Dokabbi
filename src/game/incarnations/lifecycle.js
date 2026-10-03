import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { recordEvent } from '../world/store.js';
import { scheduleEcho, echoFor } from '../world/echoes.js';
import { mintStoryCard } from '../cards/mint.js';
import { emit } from '../events/bus.js';

// A life, not a checklist: death ends agency, legacy chooses what survives.
export function requireAlive(player) {
  if (!player) return 'Use /register first.';
  if (player.status && player.status !== 'alive') {
    return `This incarnation is **${player.status}**. The Stream remembers — but the fallen do not act. See \`/incarnation record\`, or \`/incarnation reincarnate\`.`;
  }
  return null;
}

// Epithets are computed from a life, never collected like badges. Pure.
export function epithets({ alters = 0, sponsored = false, trusted = false, underdog = false, asset = false, bonded = false, refused = false, defied = false, rebirthed = 0 } = {}) {
  const titles = [];
  if (alters > 0) titles.push('Scenario Breaker');
  if (defied) titles.push('Probability-Breaker');
  if (underdog) titles.push('Stream-Famous');
  if (trusted) titles.push("Constellation's Favorite");
  else if (sponsored) titles.push('Star-Touched');
  if (asset) titles.push('Faction Asset');
  if (bonded) titles.push('Bonded');
  if (refused) titles.push('Unbound');
  if (rebirthed > 0) titles.push(`Twice-Born${rebirthed > 1 ? ` ×${rebirthed}` : ''}`);
  return titles;
}

function memorialize(db, discordId, name, cause) {
  const def = { id: 'fallen_legend', name: 'The One Who Fell Daring' };
  db.prepare('INSERT OR IGNORE INTO player_stories (discord_id, story_id) VALUES (?,?)').run(discordId, def.id);
  const no = db.prepare('SELECT COUNT(*) v FROM story_cards WHERE discord_id = ? AND card_id LIKE ?').get(discordId, 'memorial@%').v;
  mintStoryCard(db, discordId, {
    card_id: `memorial@${discordId}#${no + 1}`,
    name: `[The Fall of ${name}]`,
    scenario_id: '—',
    effect: `${cause}. The Stream remembers.`,
    power: 4,
  });
}

export function die(discordId, guildId, cause) {
  const db = getDb();
  const p = getPlayer(discordId);
  if (!p || p.status !== 'alive') return null;
  memorialize(db, discordId, p.name, cause);
  updatePlayer(discordId, { status: 'fallen', deaths: (p.deaths || 0) + 1, hp: 0, energy: 0, sponsor_id: null });
  db.prepare(`UPDATE sponsorships SET status = 'ended' WHERE discord_id = ? AND status = 'active'`).run(discordId);
  if (guildId && guildId !== 'dm') {
    recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `🕯️ ${p.name} has fallen — ${cause}.` });
    const echo = echoFor.fallen(p.name);
    scheduleEcho(guildId, echo.kind, echo.summary, echo.delayMs);
  }
  emit('incarnation_fallen', { guildId, playerId: discordId });
  return true;
}

export function retireLegacy(discordId, guildId) {
  const db = getDb();
  const p = getPlayer(discordId);
  if (!p || p.status !== 'alive') throw new Error('Only the living can retire.');
  if (p.level < 3) throw new Error('Live a little first (level 3+ to leave a legacy).');
  memorialize(db, discordId, p.name, 'retired at the height of their story');
  updatePlayer(discordId, { status: 'vanished', sponsor_id: null });
  db.prepare(`UPDATE sponsorships SET status = 'ended' WHERE discord_id = ? AND status = 'active'`).run(discordId);
  if (guildId && guildId !== 'dm') {
    recordEvent(guildId, { kind: 'world_event', actorId: discordId, summary: `🌫️ ${p.name} vanished — retired at the height of their story.` });
  }
  return true;
}

// Succession: a new life that inherits ONE story (plus what the Stream kept).
export function reincarnate(discordId, keepStoryId) {
  const db = getDb();
  const p = getPlayer(discordId);
  if (!p || p.status === 'alive') throw new Error('Only the fallen or vanished reincarnate.');
  const owned = db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(discordId).map((r) => r.story_id);
  if (!owned.includes(keepStoryId)) throw new Error('You do not carry that Story.');
  const keepCards = db.prepare('SELECT * FROM story_cards WHERE discord_id = ? AND (card_id LIKE ? OR card_id LIKE ?)').all(discordId, `${keepStoryId}@%`, 'memorial@%');
  updatePlayer(discordId, {
    status: 'alive', level: 1, xp: 0, coins: 100, hp: 100, max_hp: 100, energy: 50, max_energy: 50,
    str: 5, agi: 5, vit: 5, mag: 5, intel: 5, probability: 100, sponsor_id: null, party_id: null,
    scenario_progress: 0, rebirths: (p.rebirths || 0) + 1,
  });
  db.prepare('DELETE FROM party_members WHERE discord_id = ?').run(discordId);
  db.prepare('DELETE FROM player_stories WHERE discord_id = ?').run(discordId);
  for (const sid of owned.filter((s) => s === keepStoryId || s === 'fallen_legend')) {
    db.prepare('INSERT INTO player_stories (discord_id, story_id) VALUES (?,?)').run(discordId, sid);
  }
  db.prepare('DELETE FROM story_cards WHERE discord_id = ?').run(discordId);
  for (const c of keepCards) {
    db.prepare('INSERT INTO story_cards (card_id, discord_id, name, scenario_id, effect, power) VALUES (?,?,?,?,?,?)')
      .run(c.card_id, discordId, c.name, c.scenario_id, c.effect, c.power);
  }
  db.prepare('DELETE FROM player_attributes WHERE discord_id = ?').run(discordId);
  db.prepare("INSERT INTO player_attributes (discord_id, attribute_id, grade) VALUES (?, 'novice_reader', 'Rare')").run(discordId);
  for (const t of ['player_skills', 'player_stigmas', 'stigma_mastery', 'player_knowledge', 'player_cards', 'decks', 'companions']) {
    try { db.prepare(`DELETE FROM ${t} WHERE discord_id = ?`).run(discordId); } catch { /* table may predate */ }
  }
  return { kept: keepStoryId, rebirths: (p.rebirths || 0) + 1 };
}
