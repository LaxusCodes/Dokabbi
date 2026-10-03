import registry from '../../data/images.json' with { type: 'json' };
import { getDb } from '../database/db.js';
import { renderCardImage } from './cardRenderer.js';
import characters from '../../data/characters.json' with { type: 'json' };
import cards from '../../data/cards.json' with { type: 'json' };

// Registry lookup. card_id forms like "merciful_survivor@001" fall back to the base id.
// DB-stored URLs (set via /character set-image) take priority over the static registry.
export function imageFor(key) {
  if (!key) return null;
  const db = getDb();
  try {
    const row = db.prepare('SELECT url FROM character_images WHERE character_id = ?').get(key);
    if (row?.url) return row.url;
  } catch { /* DB not ready yet */ }
  if (registry[key]) return registry[key] || null;
  const base = String(key).split('@')[0];
  return registry[base] || null;
}

export function setCharacterImage(characterId, url) {
  const db = getDb();
  if (!url) {
    db.prepare('DELETE FROM character_images WHERE character_id = ?').run(characterId);
  } else {
    db.prepare('INSERT INTO character_images (character_id, url) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET url = ?').run(characterId, url, url);
  }
}

// Priority: real art from registry/DB > generated card. Returns a Buffer
// (for artPanel) or null (caller should fall back to text-only panel).
export function imageForCard(key) {
  const url = imageFor(key);
  if (url) return url;
  const def = characters.find((c) => c.id === key) || cards.find((c) => c.id === key);
  if (def) return renderCardImage(def);
  return null;
}

// For entities that aren't in characters/cards (monsters, players).
export function imageForEntity(entity) {
  if (!entity) return null;
  const url = imageFor(entity.id || entity.discord_id);
  if (url) return url;
  return renderCardImage(entity);
}

// NOTE: art ships through artPanel() in utils/v2.js now — embeds are not
// allowed in Components V2 messages. This module stays registry-only.
