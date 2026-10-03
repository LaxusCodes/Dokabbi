import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let db;
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  migrateDb(db);
  return db;
}

// Auditable entry point: run the full migration set against any database handle
// (integration tests use this to upgrade simulated legacy databases).
export function migrateDb(handle) {
  migrate(handle);
  ensureColumns(handle);
  ensureNameUniqueness(handle);
}

// Additive columns for databases created before the column existed.
function ensureColumns(db) {
  for (const sql of [
    'ALTER TABLE player_knowledge ADD COLUMN shared_with TEXT',
    'ALTER TABLE guild_config ADD COLUMN prefix TEXT',
    'ALTER TABLE chapter_participants ADD COLUMN branch_id INTEGER',
    'ALTER TABLE nebula_members ADD COLUMN guild_id TEXT',
    "ALTER TABLE players ADD COLUMN status TEXT DEFAULT 'alive'",
    'ALTER TABLE players ADD COLUMN deaths INTEGER DEFAULT 0',
    'ALTER TABLE players ADD COLUMN rebirths INTEGER DEFAULT 0',
    'ALTER TABLE guild_config ADD COLUMN allowed_channel_id TEXT',
    'ALTER TABLE companion_history ADD COLUMN bond INTEGER DEFAULT 0',
    'ALTER TABLE companion_history ADD COLUMN mastery INTEGER DEFAULT 0',
    'ALTER TABLE companion_history ADD COLUMN trust INTEGER DEFAULT 10',
    "ALTER TABLE player_knowledge ADD COLUMN created_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE global_votes ADD COLUMN created_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE chapter_participants ADD COLUMN created_at TEXT DEFAULT (datetime('now'))",
    'ALTER TABLE players ADD COLUMN name_norm TEXT',
    'ALTER TABLE players ADD COLUMN tutorial_step INTEGER DEFAULT 0',
    'ALTER TABLE players ADD COLUMN tutorial_msg_id TEXT',
    'ALTER TABLE players ADD COLUMN tutorial_channel_id TEXT',
  ]) {
    try {
      db.exec(sql);
    } catch {
      // already present
    }
  }
}

// Incarnation names are globally unique (case-insensitive) and permanently
// reserved — the Stream remembers the fallen, so the living cannot reuse them.
// Normalized form lives in players.name_norm with a UNIQUE index (race-safe);
// app checks give the in-world message, the index stops simultaneous dupes.
function ensureNameUniqueness(db) {
  try {
    db.exec(`UPDATE players SET name_norm = lower(trim(name)) WHERE name_norm IS NULL`);
  } catch {
    // column just added or table empty — backfill best-effort only
  }
  try {
    // Legacy DBs with dupes must never crash boot: keep earliest, suffix the rest.
    const dupes = db.prepare(`SELECT lower(trim(name)) AS n FROM players GROUP BY n HAVING COUNT(*) > 1`).all();
    for (const { n } of dupes) {
      const rows = db.prepare(`SELECT discord_id, name FROM players WHERE lower(trim(name)) = ? ORDER BY discord_id`).all(n);
      rows.slice(1).forEach((r, i) => {
        const renamed = `${r.name}~${i + 2}`.slice(0, 32);
        try {
          db.prepare(`UPDATE players SET name = ?, name_norm = ? WHERE discord_id = ?`).run(renamed, renamed.trim().toLowerCase(), r.discord_id);
        } catch { /* keep going — index creation below stays best-effort */ }
      });
    }
  } catch {
    // no players table yet or similar — nothing to dedupe
  }
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name_norm ON players(name_norm)`);
  } catch {
    // never fatal — app-side check still blocks new dupes
  }
}

function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_norm TEXT,
    tutorial_step INTEGER DEFAULT 0,
    tutorial_msg_id TEXT,
    tutorial_channel_id TEXT,
    title TEXT DEFAULT 'Unknown Reader',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    hp INTEGER DEFAULT 100,
    max_hp INTEGER DEFAULT 100,
    energy INTEGER DEFAULT 50,
    max_energy INTEGER DEFAULT 50,
    str INTEGER DEFAULT 5,
    agi INTEGER DEFAULT 5,
    vit INTEGER DEFAULT 5,
    mag INTEGER DEFAULT 5,
    intel INTEGER DEFAULT 5,
    probability INTEGER DEFAULT 100,
    sponsor_id TEXT,
    party_id TEXT,
    nebula_id TEXT,
    scenario_progress INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS player_attributes (
    discord_id TEXT, attribute_id TEXT,
    grade TEXT DEFAULT 'Common',
    PRIMARY KEY (discord_id, attribute_id)
  );
  CREATE TABLE IF NOT EXISTS player_skills (
    discord_id TEXT, skill_id TEXT,
    level INTEGER DEFAULT 1,
    PRIMARY KEY (discord_id, skill_id)
  );
  CREATE TABLE IF NOT EXISTS player_stigmas (
    discord_id TEXT, stigma_id TEXT,
    charges INTEGER DEFAULT 3,
    level INTEGER DEFAULT 1,
    PRIMARY KEY (discord_id, stigma_id)
  );
  CREATE TABLE IF NOT EXISTS inventory (
    discord_id TEXT, item_id TEXT,
    qty INTEGER DEFAULT 1,
    equipped INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS player_stories (
    discord_id TEXT, story_id TEXT,
    grade TEXT DEFAULT 'Historical',
    power INTEGER DEFAULT 1,
    PRIMARY KEY (discord_id, story_id)
  );
  CREATE TABLE IF NOT EXISTS constellation_favor (
    discord_id TEXT, constellation_id TEXT,
    favor INTEGER DEFAULT 0,
    interest INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, constellation_id)
  );
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY, name TEXT, leader_id TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS nebulas (
    id TEXT PRIMARY KEY, name TEXT, leader_id TEXT,
    treasury INTEGER DEFAULT 0, reputation INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS player_cards (
    discord_id TEXT, card_id TEXT, qty INTEGER DEFAULT 1,
    PRIMARY KEY (discord_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS decks (
    discord_id TEXT PRIMARY KEY, name TEXT, cards TEXT
  );
  CREATE TABLE IF NOT EXISTS scenario_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT, scenario_id TEXT,
    choice TEXT, outcome TEXT, coins INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS party_members (
    party_id TEXT, discord_id TEXT,
    role TEXT DEFAULT 'Damage',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (party_id, discord_id)
  );
  CREATE TABLE IF NOT EXISTS combat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT, participants TEXT, winner_id TEXT,
    log TEXT, rewards TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pvp_ratings (
    discord_id TEXT PRIMARY KEY, elo INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
    last_fight_at INTEGER, fights_today INTEGER DEFAULT 0, today_key TEXT
  );
  CREATE TABLE IF NOT EXISTS pvp_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT, opponent_id TEXT, focus TEXT DEFAULT 'front',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 3: shared world — one server, one Star Stream.
  CREATE TABLE IF NOT EXISTS server_streams (
    guild_id TEXT PRIMARY KEY, current_scenario TEXT DEFAULT '001',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scenario_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, scenario_id TEXT, altered INTEGER DEFAULT 0,
    altered_by TEXT, summary TEXT,
    UNIQUE (guild_id, scenario_id)
  );
  CREATE TABLE IF NOT EXISTS world_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, kind TEXT, actor_id TEXT, summary TEXT, data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS player_knowledge (
    discord_id TEXT, knowledge_id TEXT, source TEXT DEFAULT 'observe', scope TEXT DEFAULT 'private', shared_with TEXT,
    PRIMARY KEY (discord_id, knowledge_id)
  );
  CREATE TABLE IF NOT EXISTS npc_states (
    guild_id TEXT, npc_id TEXT, known_events TEXT DEFAULT '[]',
    PRIMARY KEY (guild_id, npc_id)
  );
  CREATE TABLE IF NOT EXISTS npc_trust (
    guild_id TEXT, npc_id TEXT, discord_id TEXT, trust INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, npc_id, discord_id)
  );
  CREATE TABLE IF NOT EXISTS story_cards (
    card_id TEXT, discord_id TEXT, name TEXT, scenario_id TEXT, effect TEXT, power INTEGER DEFAULT 1,
    PRIMARY KEY (card_id, discord_id)
  );
  -- Phase 4: canon layer + server-wide scenarios.
  CREATE TABLE IF NOT EXISTS canon_npcs (
    guild_id TEXT, npc_id TEXT, location TEXT DEFAULT 'Unknown', attention INTEGER DEFAULT 0, flags TEXT DEFAULT '{}',
    PRIMARY KEY (guild_id, npc_id)
  );
  CREATE TABLE IF NOT EXISTS npc_knowledge (
    guild_id TEXT, npc_id TEXT, knowledge_id TEXT, tier TEXT DEFAULT 'canon',
    PRIMARY KEY (guild_id, npc_id, knowledge_id)
  );
  CREATE TABLE IF NOT EXISTS server_flags (
    guild_id TEXT, key TEXT, value TEXT,
    PRIMARY KEY (guild_id, key)
  );
  CREATE TABLE IF NOT EXISTS global_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, scenario_id TEXT, a_label TEXT, b_label TEXT,
    status TEXT DEFAULT 'open', ends_at INTEGER, consequence TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS global_votes (
    global_id INTEGER, discord_id TEXT, choice TEXT DEFAULT 'A',
    PRIMARY KEY (global_id, discord_id)
  );
  -- Phase 5: constellation wagers + audience economy (real escrow, no double-spend).
  CREATE TABLE IF NOT EXISTS constellation_wallets (
    guild_id TEXT, constellation_id TEXT, balance INTEGER DEFAULT 20000, influence INTEGER DEFAULT 60, escrow INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, constellation_id)
  );
  CREATE TABLE IF NOT EXISTS wagers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, global_id INTEGER, kind TEXT, backer_id TEXT,
    side TEXT, amount INTEGER, anonymous INTEGER DEFAULT 0, status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 6: Sponsorship 2.0 — earned offers, negotiated contracts, live expectations.
  CREATE TABLE IF NOT EXISTS sponsorship_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, discord_id TEXT, constellation_id TEXT,
    coins INTEGER, stigma TEXT, expectation_type TEXT, expectation_required INTEGER,
    duration INTEGER DEFAULT 3, status TEXT DEFAULT 'pending', negotiations INTEGER DEFAULT 0,
    conflict INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sponsorships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, discord_id TEXT, constellation_id TEXT, status TEXT DEFAULT 'active',
    favor_at_start INTEGER, coins INTEGER, stigma TEXT, duration INTEGER DEFAULT 3, scenarios_done INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sponsorship_expectations (
    contract_id INTEGER, type TEXT, required INTEGER DEFAULT 1, progress INTEGER DEFAULT 0, status TEXT DEFAULT 'open',
    PRIMARY KEY (contract_id, type)
  );
  CREATE TABLE IF NOT EXISTS sponsorship_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, discord_id TEXT, constellation_id TEXT, kind TEXT, summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 7: Nebula 3.0 + knowledge permissions (factions, secrets, information warfare).
  CREATE TABLE IF NOT EXISTS nebula_members (
    nebula_id TEXT, discord_id TEXT, reputation INTEGER DEFAULT 0, last_aid_at INTEGER, guild_id TEXT,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (nebula_id, discord_id)
  );
  CREATE TABLE IF NOT EXISTS nebula_relationships (
    guild_id TEXT, nebula_a TEXT, nebula_b TEXT, state TEXT DEFAULT 'Neutral',
    PRIMARY KEY (guild_id, nebula_a, nebula_b)
  );
  CREATE TABLE IF NOT EXISTS nebula_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, nebula_id TEXT, kind TEXT, summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS nebula_secrets (
    guild_id TEXT, nebula_id TEXT, agenda_id TEXT, revealed_by TEXT,
    PRIMARY KEY (guild_id, nebula_id, agenda_id)
  );
  -- Phase 8 (Combat 2.0): stigma mastery, constellation duels, battle bonds.
  CREATE TABLE IF NOT EXISTS stigma_mastery (
    discord_id TEXT, stigma_id TEXT, uses INTEGER DEFAULT 0, protects INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, stigma_id)
  );
  CREATE TABLE IF NOT EXISTS duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, challenger_const TEXT, defender_const TEXT, cause TEXT,
    status TEXT DEFAULT 'open', winner TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS duel_participants (
    duel_id INTEGER, discord_id TEXT, side TEXT DEFAULT 'A',
    PRIMARY KEY (duel_id, discord_id)
  );
  CREATE TABLE IF NOT EXISTS bond_counters (
    a TEXT, b TEXT, guild_id TEXT, saves INTEGER DEFAULT 0, honored INTEGER DEFAULT 0,
    PRIMARY KEY (a, b, guild_id)
  );
  -- Phase 9 (Scenario Engine 2.0): generated chapters, never overwriting history.
  CREATE TABLE IF NOT EXISTS chapter_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, chapter_no INTEGER, data TEXT, status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (guild_id, chapter_no)
  );
  CREATE TABLE IF NOT EXISTS chapter_participants (
    chapter_id INTEGER, discord_id TEXT, choice TEXT, branch_id INTEGER,
    PRIMARY KEY (chapter_id, discord_id)
  );
  -- Phase 10 (Parallel Arcs): branches share one world; collisions are first-class.
  CREATE TABLE IF NOT EXISTS chapter_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, chapter_no INTEGER, branch_key TEXT, path TEXT, locked_paths TEXT DEFAULT '[]', status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (guild_id, chapter_no, branch_key)
  );
  CREATE TABLE IF NOT EXISTS chapter_collisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, chapter_no INTEGER, branch_a TEXT, branch_b TEXT, kind TEXT, status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 11 (Spectacle): the stream watches back. world_events stays the backbone.
  CREATE TABLE IF NOT EXISTS channel_state (
    guild_id TEXT PRIMARY KEY, excitement INTEGER DEFAULT 20, disturbance INTEGER DEFAULT 0,
    channel_value INTEGER DEFAULT 10, host_id TEXT, updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audience_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, reaction TEXT, constellation_id TEXT, event_kind TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS constellation_attention (
    guild_id TEXT, constellation_id TEXT, interest INTEGER DEFAULT 10,
    PRIMARY KEY (guild_id, constellation_id)
  );
  CREATE TABLE IF NOT EXISTS constellation_interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, constellation_id TEXT, kind TEXT, cost INTEGER, target_id TEXT, summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 12 (Living Characters): memory, goals, relationships, autonomous actions.
  CREATE TABLE IF NOT EXISTS character_memory (
    guild_id TEXT, char_id TEXT, key TEXT, value TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, char_id, key)
  );
  CREATE TABLE IF NOT EXISTS character_relationships (
    guild_id TEXT, char_id TEXT, target_id TEXT,
    fear INTEGER DEFAULT 0, respect INTEGER DEFAULT 0, interest INTEGER DEFAULT 0, hostility INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, char_id, target_id)
  );
  CREATE TABLE IF NOT EXISTS character_goals (
    guild_id TEXT, char_id TEXT, goal TEXT, progress INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
    PRIMARY KEY (guild_id, char_id, goal)
  );
  CREATE TABLE IF NOT EXISTS character_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, char_id TEXT, action TEXT, summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 13 (Global Star Stream): one universe above all servers. Server tables stay local.
  CREATE TABLE IF NOT EXISTS constellation_global (
    constellation_id TEXT PRIMARY KEY, influence INTEGER DEFAULT 60, renown INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS global_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT, summary TEXT, origin_guild TEXT, data TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 14 (Daily Loop): check-ins, personalized missions, streaks.
  CREATE TABLE IF NOT EXISTS daily_state (
    discord_id TEXT PRIMARY KEY, day TEXT, missions TEXT, claimed TEXT, checkin INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS player_streaks (
    discord_id TEXT PRIMARY KEY, streak INTEGER DEFAULT 0, best INTEGER DEFAULT 0, last_day TEXT
  );
  -- Phase 15 (Collection): historical team versions, public showcases.
  CREATE TABLE IF NOT EXISTS team_card_history (
    card_id TEXT, version INTEGER, name TEXT, members TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (card_id, version)
  );
  CREATE TABLE IF NOT EXISTS showcase (
    discord_id TEXT, slot INTEGER, card_id TEXT,
    PRIMARY KEY (discord_id, slot)
  );
  -- Phase 16B (Titles): behavior counters, earned titles, 1 primary + 2 secondaries.
  CREATE TABLE IF NOT EXISTS title_counters (
    discord_id TEXT, key TEXT, value INTEGER DEFAULT 0,
    PRIMARY KEY (discord_id, key)
  );
  CREATE TABLE IF NOT EXISTS player_titles (
    discord_id TEXT, title_id TEXT, earned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (discord_id, title_id)
  );
  CREATE TABLE IF NOT EXISTS title_slots (
    discord_id TEXT PRIMARY KEY, primary_id TEXT, secondary1 TEXT, secondary2 TEXT
  );
  -- Phase 16A (Companions): one equipped companion + their shared history.
  CREATE TABLE IF NOT EXISTS companions (
    discord_id TEXT PRIMARY KEY, character_id TEXT
  );
  CREATE TABLE IF NOT EXISTS companion_history (
    discord_id TEXT, character_id TEXT, uses INTEGER DEFAULT 0, victories INTEGER DEFAULT 0,
    defeats INTEGER DEFAULT 0, scenarios INTEGER DEFAULT 0, notable TEXT DEFAULT '[]',
    PRIMARY KEY (discord_id, character_id)
  );
  -- Phase 16B (Marketplace): escrowed listings. Lives are never tradable —
  -- only inventory goods move. Stories, titles, sponsors, identity stay bound.
  CREATE TABLE IF NOT EXISTS market_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, seller_id TEXT, buyer_id TEXT, item_id TEXT, qty INTEGER, price INTEGER,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Phase 16C (Merchant identity): one shop per player per guild, reputation earned.
  CREATE TABLE IF NOT EXISTS merchant_profiles (
    guild_id TEXT, player_id TEXT, shop_name TEXT, reputation INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0, volume INTEGER DEFAULT 0, cancelled INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, player_id)
  );
  -- Phase 16D (Auctions): bid escrow over the same settlement core. No second economy.
  CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, seller_id TEXT, item_id TEXT, qty INTEGER, starting_price INTEGER,
    current_bid INTEGER, current_bidder TEXT, ends_at INTEGER, status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Presence layer: where the Stream speaks unprompted, and what it still owes.
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY, stream_channel_id TEXT, allowed_channel_id TEXT, prefix TEXT
  );
  CREATE TABLE IF NOT EXISTS pending_echoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, fire_at INTEGER, kind TEXT, summary TEXT, data TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );
  -- Emoji overrides: admin-set values beat data/emojis.json per key.
  CREATE TABLE IF NOT EXISTS emoji_overrides (
    key TEXT PRIMARY KEY, value TEXT
  );
  -- Character images: server owners can set custom art URLs
  CREATE TABLE IF NOT EXISTS character_images (
    character_id TEXT PRIMARY KEY, url TEXT
  );
  -- Cooldowns: spam control that survives restarts.
  CREATE TABLE IF NOT EXISTS cooldowns (
    discord_id TEXT, key TEXT, expires_at INTEGER,
    PRIMARY KEY (discord_id, key)
  );
  -- Phase 19 (Seasons): content is config; the Director is the engine.
  CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY, status TEXT DEFAULT 'open', winners TEXT,
    closed_at TEXT
  );
  `);
}
