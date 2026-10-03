import { getDb } from '../../database/db.js';
import { on } from '../events/bus.js';
import { CHARACTER_DEFS, GOALS } from './system.js';
import { remember, recall, bumpMemory, mayLearn, markKnown, knows } from './memory.js';
import { relationshipState, adjustAxis, statesFor } from './relationships.js';
import { goalsOf, setGoalProgress, signalCounts } from './goals.js';
import { decide, investigatePlayer } from './behavior.js';
import { recordEvent, getOrCreateStream } from '../world/store.js';
import { getDokja, setDokjaLocation } from '../canon/store.js';
import locations from '../../../data/locations.json' with { type: 'json' };

export const ROSTER = Object.keys(CHARACTER_DEFS);

function charName(charId) {
  return CHARACTER_DEFS[charId]?.name || charId;
}

export function logAction(guildId, charId, action, summary) {
  getDb().prepare('INSERT INTO character_actions (guild_id, char_id, action, summary) VALUES (?,?,?,?)').run(guildId, charId, action, summary);
}

export function recentActions(guildId, charId, limit = 5) {
  return getDb().prepare('SELECT * FROM character_actions WHERE guild_id = ? AND char_id = ? ORDER BY id DESC LIMIT ?').all(guildId, charId, limit);
}

// Apply one decided action through world systems. Returns a visible line or null.
export function applyAction(guildId, charId, action, ctx = {}) {
  const { playerId = null, playerName = 'someone' } = ctx;
  switch (action.type) {
    case 'relocate': {
      const loc = locations[Math.floor(Math.random() * locations.length)];
      if (charId === 'kim_dokja') {
        setDokjaLocation(guildId, loc.name);
      } else {
        remember(guildId, charId, 'location', loc.name);
      }
      const summary = `${charName(charId)} was seen heading for ${loc.name}. No command sent them — the world acted on its own.`;
      logAction(guildId, charId, 'relocate', summary);
      recordEvent(guildId, { kind: 'world_event', actorId: null, summary });
      return summary;
    }
    case 'investigate': {
      if (!playerId) return null;
      const hides = parseInt(recall(guildId, charId, `hides:${playerId}`, '0'), 10) || 0;
      const alters = parseInt(recall(guildId, charId, 'alters_seen', '0'), 10) || 0;
      const result = investigatePlayer({ hides, alters, sharedPublic: 0 });
      remember(guildId, charId, `investigated:${playerId}`, result.found || 'nothing');
      const summary = `📖 ${charName(charId)} investigated ${playerName}: "${result.line}"`;
      logAction(guildId, charId, 'investigate', summary);
      if (result.found) {
        recordEvent(guildId, { kind: 'world_event', actorId: playerId, summary });
        adjustAxis(guildId, charId, playerId, 'interest', 10);
      }
      return result.found ? summary : null;
    }
    case 'warn': {
      remember(guildId, charId, 'warned', '1');
      const summary = `📖 ${charName(charId)} warns ${playerName}: "One more step and we are enemies."`;
      logAction(guildId, charId, 'warn', summary);
      recordEvent(guildId, { kind: 'world_event', actorId: playerId, summary });
      return summary;
    }
    case 'rumor': {
      const recent = getDb().prepare('SELECT summary FROM world_events WHERE guild_id = ? ORDER BY id DESC LIMIT 1').get(guildId);
      const summary = `🗣️ The Plaza Runner carries news: "${recent?.summary || 'nothing worth selling'}"${recent ? ' — half the stream hears a version of it.' : ''}`;
      logAction(guildId, charId, 'rumor', summary);
      recordEvent(guildId, { kind: 'world_event', actorId: null, summary });
      return summary;
    }
    default:
      return null;
  }
}

function characterLocation(guildId, charId) {
  if (charId === 'kim_dokja') return getDokja(guildId).location;
  return recall(guildId, charId, 'location') || getOrCreateStream(guildId).current_scenario;
}

// After major events, every roster character evaluates goals and may act.
function evaluateAll(guildId, eventKind, payload = {}) {
  const signals = signalCounts(guildId);
  for (const charId of ROSTER) {
    for (const g of goalsOf(guildId, charId)) {
      const signal = GOALS[g.goal]?.signal;
      if (signal && signals[signal] !== undefined) setGoalProgress(guildId, charId, g.goal, signals[signal]);
    }
    if (eventKind === 'altered') bumpMemory(guildId, charId, 'alters_seen');
    const state = payload.playerId ? relationshipState(guildId, charId, payload.playerId) : 'Unknown';
    const action = decide({
      charId,
      goals: goalsOf(guildId, charId),
      state,
      attention: getDokja(guildId).attention,
      memories: Object.fromEntries(getDb().prepare('SELECT key, value FROM character_memory WHERE guild_id = ? AND char_id = ?').all(guildId, charId).map((r) => [r.key, r.value])),
      eventKind: eventKind === 'altered' ? 'altered' : eventKind === 'clear' ? 'clear' : null,
      rng: Math.random,
    });
    if (action.type !== 'none' && action.type !== 'observe') {
      // NPCs act sparingly: one coin-flip against a chatty world.
      if (Math.random() < 0.5) applyAction(guildId, charId, action, payload);
    }
  }
}

export function registerCharacterListeners() {
  if (registerCharacterListeners.done) return;
  registerCharacterListeners.done = true;
  on('scenario_cleared', ({ guildId, playerId }) => {
    const p = getDb().prepare('SELECT name FROM players WHERE discord_id = ?').get(playerId);
    evaluateAll(guildId, 'clear', { playerId, playerName: p?.name || 'someone' });
  });
  on('scenario_altered', ({ guildId, playerId }) => {
    const p = getDb().prepare('SELECT name FROM players WHERE discord_id = ?').get(playerId);
    evaluateAll(guildId, 'altered', { playerId, playerName: p?.name || 'someone' });
  });
  on('knowledge_shared', ({ guildId, playerId, knowledgeId, scope }) => {
    if (scope !== 'public' || !knowledgeId) return;
    // Public knowledge drifts into NPC ears — through the open, like everyone else.
    for (const charId of ROSTER) {
      if (!knows(guildId, charId, knowledgeId)) {
        markKnown(guildId, charId, knowledgeId);
        logAction(guildId, charId, 'learn', `${charName(charId)} picked up ${knowledgeId} from the open stream.`);
      }
    }
  });
}

export { characterLocation, statesFor };
