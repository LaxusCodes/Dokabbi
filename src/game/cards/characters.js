import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { mintStoryCard } from './mint.js';
import characters from '../../../data/characters.json' with { type: 'json' };

// Game-layer ranks (S→SSS are OUR tiers, not ORV canon grades). Higher rank, rarer pull.
export const RANKS = ['C', 'B', 'A', 'S', 'S+', 'SS', 'SSS'];
export const RANK_WEIGHTS = { C: 34, B: 26, A: 17, S: 11, 'S+': 6, SS: 4, SSS: 2 };
export const RANK_POWER = { C: 4, B: 7, A: 11, S: 16, 'S+': 22, SS: 30, SSS: 40 };
export const RANK_RARITY = { C: 'Common', B: 'Uncommon', A: 'Rare', S: 'Epic', 'S+': 'Epic', SS: 'Legendary', SSS: 'Myth' };
export const RECRUIT_COST = 500;

export const listCharacters = () => characters;
export const findCharacter = (id) => characters.find((c) => c.id === id);
export function powerOf(def) {
  return RANK_POWER[def.gameRank] ?? 5;
}

export function pickCharacter(rng = Math.random) {
  const total = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let rank = 'C';
  for (const [k, w] of Object.entries(RANK_WEIGHTS)) {
    if ((r -= w) <= 0) { rank = k; break; }
  }
  const pool = characters.filter((c) => c.gameRank === rank);
  const list = pool.length ? pool : characters;
  return list[Math.floor(rng() * list.length)];
}

// Recruit: coins leave immediately, the character joins your collection.
// Characters are unique — owned ones are excluded, so no card spam.
export function recruitCharacter(discordId, rng = Math.random) {
  const p = getPlayer(discordId);
  if (!p) throw new Error('Register first with /register.');
  if (p.coins < RECRUIT_COST) throw new Error(`Recruiting costs ${RECRUIT_COST} coins.`);
  const owned = new Set(getDb().prepare('SELECT card_id FROM story_cards WHERE discord_id = ?').all(discordId).map((r) => r.card_id));
  const pool = characters.filter((c) => !owned.has(c.id));
  if (!pool.length) throw new Error('You have recruited everyone. The Stream is impressed.');
  const def = pickFrom(pool, rng);
  updatePlayer(discordId, { coins: p.coins - RECRUIT_COST });
  mintStoryCard(getDb(), discordId, {
    card_id: def.id,
    name: `[${def.name}]`,
    scenario_id: 'recruit',
    effect: `${def.description} Signature skill — ${def.skill.name}: ${def.skill.description}`,
    power: powerOf(def),
  });
  return def;
}

function pickFrom(pool, rng) {
  const total = pool.reduce((s, c) => s + (RANK_WEIGHTS[c.gameRank] ?? 1), 0);
  let r = rng() * total;
  for (const c of pool) {
    if ((r -= RANK_WEIGHTS[c.gameRank] ?? 1) <= 0) return c;
  }
  return pool[pool.length - 1];
}

// One companion slot: choosing matters. Equipping replaces; nothing is lost.
export function getCompanion(discordId) {
  const row = getDb().prepare('SELECT character_id FROM companions WHERE discord_id = ?').get(discordId);
  if (!row) return null;
  return findCharacter(row.character_id) || null;
}

export function equipCompanion(discordId, characterId) {
  const def = findCharacter(characterId);
  if (!def) throw new Error('No such character.');
  const owned = getDb().prepare('SELECT card_id FROM story_cards WHERE discord_id = ? AND card_id = ?').get(discordId, characterId);
  if (!owned) throw new Error('Recruit them first — companions come from your collection.');
  getDb().prepare('INSERT INTO companions (discord_id, character_id) VALUES (?,?) ON CONFLICT(discord_id) DO UPDATE SET character_id=?')
    .run(discordId, characterId, characterId);
  return def;
}

export function unequipCompanion(discordId) {
  getDb().prepare('DELETE FROM companions WHERE discord_id = ?').run(discordId);
}

// Shared history + progression: uses, victories, bond, mastery, trust.
// Bond grows through shared events, mastery through wins, trust through care.
export function recordCompanionFight(discordId, characterId, { victory, gambitWin = false, playerName = 'someone', ownerDied = false } = {}) {
  const db = getDb();
  db.prepare('INSERT INTO companion_history (discord_id, character_id, uses) VALUES (?,?,1) ON CONFLICT(discord_id,character_id) DO UPDATE SET uses=uses+1')
    .run(discordId, characterId);
  if (victory) db.prepare('UPDATE companion_history SET victories=victories+1, scenarios=scenarios+1 WHERE discord_id=? AND character_id=?').run(discordId, characterId);
  else db.prepare('UPDATE companion_history SET defeats=defeats+1, scenarios=scenarios+1 WHERE discord_id=? AND character_id=?').run(discordId, characterId);
  const prog = { bond: victory ? 3 : 1, mastery: victory ? 1 : 0, trust: victory ? 2 : 1 };
  if (gambitWin) prog.bond += 2;
  if (ownerDied) {
    prog.trust = -10;
    prog.bond = -5;
  }
  db.prepare(`UPDATE companion_history SET
    bond = MAX(0, COALESCE(bond, 0) + ?),
    mastery = MAX(0, COALESCE(mastery, 0) + ?),
    trust = MAX(0, MIN(100, COALESCE(trust, 10) + ?))
    WHERE discord_id = ? AND character_id = ?`).run(prog.bond, prog.mastery, prog.trust, discordId, characterId);
  if (gambitWin) {
    const row = db.prepare('SELECT notable FROM companion_history WHERE discord_id=? AND character_id=?').get(discordId, characterId);
    const notes = JSON.parse(row.notable || '[]');
    const note = `defied probability beside ${playerName}`;
    if (!notes.includes(note)) {
      notes.push(note);
      db.prepare('UPDATE companion_history SET notable=? WHERE discord_id=? AND character_id=?').run(JSON.stringify(notes), discordId, characterId);
    }
  }
}

export function companionHistory(discordId, characterId) {
  return getDb().prepare('SELECT * FROM companion_history WHERE discord_id=? AND character_id=?').get(discordId, characterId);
}
export function characterCombatant(def, team = 'A') {
  const power = powerOf(def);
  return {
    id: def.id, name: def.name, power,
    tags: [...(def.tags || []), `rank:${def.gameRank}`],
    cost: RANKS.indexOf(def.gameRank) + 1,
  };
}
