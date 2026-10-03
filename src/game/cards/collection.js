import { getDb } from '../../database/db.js';
import { RANK_RARITY } from './characters.js';
import { emRarity } from '../display/emojis.js';
import characterDefs from '../../../data/characters.json' with { type: 'json' };

const characterIds = new Set(characterDefs.map((c) => c.id));
const characterRank = Object.fromEntries(characterDefs.map((c) => [c.id, c.gameRank]));

// Rarity is historical significance, never click-count. Pure taxonomy.
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Unique', 'Legendary', 'Myth'];
export const RARITY_EMOJI = { Common: '▫️', Uncommon: '🟩', Rare: '💙', Epic: '💜', Unique: '🟨', Legendary: '⭐', Myth: '🌌' };
export const SHOWCASE_SLOTS = 4;

const BY_STORY = {
  defied_probability: ['legendary', 'Myth'],
  breaker_impossible: ['story', 'Epic'],
  merciful_survivor: ['story', 'Rare'],
  survived_together: ['story', 'Rare'],
  refused_nebula: ['story', 'Rare'],
  nebula_asset: ['faction', 'Epic'],
  chosen_by_a_star: ['sponsor', 'Legendary'],
  fallen_legend: ['memorial', 'Legendary'],
};

export function classifyCard(card) {
  const id = card.card_id || '';
  if (characterIds.has(id)) return { category: 'character', rarity: RANK_RARITY[characterRank[id]] || 'Common' };
  if (id.startsWith('memorial@')) return { category: 'memorial', rarity: 'Legendary' };
  if (id.startsWith('team_')) return { category: 'team', rarity: 'Rare' };
  if (id.startsWith('sponsored@')) return { category: 'sponsor', rarity: 'Epic' };
  if (id.startsWith('server_')) {
    return { category: 'world', rarity: id.includes('underdog') ? 'Myth' : 'Legendary' };
  }
  if (id.startsWith('discovery@')) return { category: 'world', rarity: 'Myth' };
  const storyId = id.split('@')[0];
  if (BY_STORY[storyId]) {
    const [category, rarity] = BY_STORY[storyId];
    return { category, rarity };
  }
  const power = card.power || 0; // fallback grades by story-weight, not RNG
  const rarity = power >= 7 ? 'Myth' : power >= 5 ? 'Legendary' : power >= 4 ? 'Epic' : power >= 3 ? 'Rare' : power >= 2 ? 'Uncommon' : 'Common';
  return { category: 'story', rarity };
}

export function collectionTally(cards) {
  const byCategory = {};
  const byRarity = {};
  const detailed = cards.map((c) => {
    const t = classifyCard(c);
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    byRarity[t.rarity] = (byRarity[t.rarity] || 0) + 1;
    return { ...c, ...t };
  });
  return { byCategory, byRarity, detailed };
}

export function collectionText(name, tally, titles = []) {
  const cats = [['character', 'Characters'], ['story', 'Stories'], ['team', 'Teams'], ['sponsor', 'Sponsors'], ['faction', 'Factions'], ['world', 'World Events'], ['memorial', 'Memorials'], ['legendary', 'Legends']];
  const lines = [`🎴 ${name.toUpperCase()} — COLLECTION`, ''];
  for (const [key, label] of cats) {
    if (tally.byCategory[key]) lines.push(`${label}  ${tally.byCategory[key]}`);
  }
  lines.push('', '━━━━━━━━━━━━━━━━━━', '');
  for (const r of [...RARITY_ORDER].reverse()) {
    if (tally.byRarity[r]) lines.push(`${emRarity(r, RARITY_EMOJI[r])} ${r}  ${tally.byRarity[r]}`);
  }
  if (titles.length) lines.push('', `_${titles.join(' • ')}_`);
  if (!lines.some((l) => /^\S/.test(l) && /\d/.test(l))) lines.push('_Nothing worth remembering — yet._');
  return lines.join('\n');
}

// Showcase: up to 4 owned cards, publicly flexed.
export function setShowcase(discordId, cardId, slot = 0) {
  const db = getDb();
  if (slot < 0 || slot >= SHOWCASE_SLOTS) throw new Error(`Showcase holds ${SHOWCASE_SLOTS} cards (slots 0–${SHOWCASE_SLOTS - 1}).`);
  const owned = db.prepare('SELECT card_id FROM story_cards WHERE discord_id = ? AND card_id = ?').get(discordId, cardId);
  if (!owned) throw new Error('You do not hold that card. Collections are earned, not claimed.');
  db.prepare('INSERT INTO showcase (discord_id, slot, card_id) VALUES (?,?,?) ON CONFLICT(discord_id,slot) DO UPDATE SET card_id=?')
    .run(discordId, slot, cardId, cardId);
}

export function clearShowcase(discordId, slot = null) {
  const db = getDb();
  if (slot === null) db.prepare('DELETE FROM showcase WHERE discord_id = ?').run(discordId);
  else db.prepare('DELETE FROM showcase WHERE discord_id = ? AND slot = ?').run(discordId, slot);
}

export function showcaseOf(discordId) {
  const rows = getDb().prepare(
    'SELECT s.slot, s.card_id, c.name, c.effect, c.power FROM showcase s LEFT JOIN story_cards c ON c.card_id = s.card_id AND c.discord_id = s.discord_id WHERE s.discord_id = ? ORDER BY s.slot'
  ).all(discordId);
  return rows.map((r) => ({ ...r, ...classifyCard({ card_id: r.card_id, power: r.power }) }));
}

// Team history: leaving updates the living card; the record keeps every roster.
export function snapshotTeamHistory(cardId, name, members) {
  const db = getDb();
  const last = db.prepare('SELECT members FROM team_card_history WHERE card_id = ? ORDER BY version DESC LIMIT 1').get(cardId);
  const key = [...members].sort().join('|');
  if (last && [...JSON.parse(last.members)].sort().join('|') === key) return null;
  const version = (db.prepare('SELECT COUNT(*) v FROM team_card_history WHERE card_id = ?').get(cardId).v || 0) + 1;
  db.prepare('INSERT INTO team_card_history (card_id, version, name, members) VALUES (?,?,?,?)')
    .run(cardId, version, name, JSON.stringify(members));
  return version;
}

export function teamHistory(cardId) {
  return getDb().prepare('SELECT * FROM team_card_history WHERE card_id = ? ORDER BY version').all(cardId)
    .map((r) => ({ ...r, members: JSON.parse(r.members) }));
}

// Server prestige: fame for what happened, never for levels ground.
export function prestigeOf({ channelValue = 0, divergence = 0, events = 0, anomalies = 0, collisions = 0 } = {}) {
  const score = Math.round(channelValue + divergence * 0.5 + events * 0.2 + anomalies * 10 + collisions * 3);
  const title = score >= 150 ? 'Mythic Nexus' : score >= 100 ? 'Legendary Stream' : score >= 60 ? 'Famous' : score >= 30 ? 'Watched' : score >= 10 ? 'Noticed' : 'Unknown';
  return { score, title };
}
