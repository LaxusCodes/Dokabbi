import { getDb } from '../../database/db.js';
import registry from '../../../data/emojis.json' with { type: 'json' };
import titles from '../../../data/titles.json' with { type: 'json' };

// ONE place for every emoji. Precedence: admin override > registry > built-in.
// Values may be unicode or Discord custom codes (<:name:id>) — both render
// as plain message text, so no API changes are ever needed to reskin.
function overrides() {
  try {
    return Object.fromEntries(
      getDb().prepare('SELECT key, value FROM emoji_overrides').all().map((r) => [r.key, r.value])
    );
  } catch {
    return {};
  }
}

export function em(section, key, fallback = '') {
  const over = overrides()[`${section}.${key}`];
  if (over) return over;
  return registry[section]?.[key] ?? fallback;
}

// Titles carry their own emoji; the registry only overrides.
export function emTitle(id) {
  const over = overrides()[`titles.${id}`] ?? registry.titles?.[id];
  if (over) return over;
  return titles.find((t) => t.id === id)?.emoji || '';
}

export function emRank(rank) {
  return em('ranks', rank, rank);
}

export function emRole(role) {
  return em('roles', role, '');
}

export function emRarity(rarity) {
  return em('rarities', rarity, rarity);
}

export function emUi(key, fallback = '') {
  return em('ui', key, fallback);
}

export function setEmojiOverride(key, value) {
  getDb().prepare('INSERT INTO emoji_overrides (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=?')
    .run(key, value, value);
}

export function clearEmojiOverride(key) {
  return getDb().prepare('DELETE FROM emoji_overrides WHERE key = ?').run(key).changes > 0;
}

export function listEmojiOverrides() {
  return getDb().prepare('SELECT key, value FROM emoji_overrides ORDER BY key').all();
}
