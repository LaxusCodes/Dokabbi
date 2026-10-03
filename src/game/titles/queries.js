import { getDb } from '../../database/db.js';
import { getPlayer } from '../players/model.js';
import { memberOf } from '../nebulas/store.js';
import { RARITY_ORDER } from '../cards/collection.js';
import characterDefs from '../../../data/characters.json' with { type: 'json' };

const charRarity = Object.fromEntries(characterDefs.map((c) => [c.id, ({ SSS: 'Myth', SS: 'Legendary', 'S+': 'Epic', S: 'Epic', A: 'Rare', B: 'Uncommon', C: 'Common' })[c.gameRank]]));

// Every live stat titles can demand. Pure reads, no new writes.
export function gatherStats(discordId, guildId) {
  const db = getDb();
  const p = getPlayer(discordId);
  const q = (sql, ...params) => { try { return db.prepare(sql).get(discordId, ...params); } catch { return null; } };
  const cards = db.prepare('SELECT card_id, power FROM story_cards WHERE discord_id = ?').all(discordId);
  const rarityOf = (c) => {
    if (c.card_id.startsWith('server_')) return c.card_id.includes('underdog') ? 'Myth' : 'Legendary';
    if (c.card_id.startsWith('discovery@')) return 'Myth';
    if (c.card_id.startsWith('memorial@')) return 'Legendary';
    if (charRarity[c.card_id]) return charRarity[c.card_id];
    const storyId = c.card_id.split('@')[0];
    const map = { defied_probability: 'Myth', breaker_impossible: 'Epic', chosen_by_a_star: 'Legendary', fallen_legend: 'Legendary', nebula_asset: 'Epic' };
    if (map[storyId]) return map[storyId];
    const pw = c.power || 0;
    return pw >= 7 ? 'Myth' : pw >= 5 ? 'Legendary' : pw >= 4 ? 'Epic' : pw >= 3 ? 'Rare' : pw >= 2 ? 'Uncommon' : 'Common';
  };
  const rarities = cards.map(rarityOf);
  const rankIdx = (r) => RARITY_ORDER.indexOf(r);
  const combatLogs = db.prepare('SELECT kind, winner_id, participants FROM combat_logs').all();
  const mine = combatLogs.filter((l) => { try { return JSON.parse(l.participants || '[]').includes(discordId); } catch { return (l.participants || '').includes(discordId); } });
  const pvp = combatLogs.filter((l) => l.kind === 'pvp' && (l.participants || '').includes(discordId));
  const rivalCounts = {};
  const rivalWins = {};
  for (const l of pvp) {
    let parts = [];
    try { parts = JSON.parse(l.participants || '[]'); } catch { continue; }
    const opp = parts.find((x) => x !== discordId && !String(x).startsWith('companion:'));
    if (!opp) continue;
    rivalCounts[opp] = (rivalCounts[opp] || 0) + 1;
    if (l.winner_id === discordId) rivalWins[opp] = (rivalWins[opp] || 0) + 1;
  }
  const bestRival = Object.entries(rivalCounts).sort((a, b) => b[1] - a[1])[0];
  const neb = memberOf(discordId, guildId);
  const knowledge = db.prepare('SELECT knowledge_id, scope FROM player_knowledge WHERE discord_id = ?').all(discordId);
  return {
    clears: (q('SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND outcome = ?', 'success')?.v || 0)
      + db.prepare('SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ?').get(discordId).v,
    peaceful: db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice IN ('help','forewarn','defer','testify')`).get(discordId).v
      + db.prepare(`SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ? AND choice IN ('protect','cover','testify','defer','ask_reader')`).get(discordId).v,
    violent: db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice IN ('lure','confront')`).get(discordId).v
      + db.prepare(`SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ? AND choice IN ('confront','ledger_cut','gate_duty')`).get(discordId).v,
    alters: q('SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND kind = ?', 'scenario_altered')?.v || 0,
    stories: db.prepare('SELECT COUNT(*) v FROM player_stories WHERE discord_id = ?').get(discordId).v,
    collection: cards.length,
    collection: cards.length,
    memorials: cards.filter((c) => c.card_id.startsWith('memorial@')).length,
    legendary_cards: rarities.filter((r) => rankIdx(r) >= rankIdx('Legendary')).length,
    myth_cards: rarities.filter((r) => r === 'Myth').length,
    underdog_cards: cards.filter((c) => c.card_id.includes('underdog')).length,
    combats: mine.length,
    wins: mine.filter((l) => l.winner_id === discordId).length,
    defeats: mine.filter((l) => l.winner_id && l.winner_id !== discordId).length,
    pve_wins: mine.filter((l) => l.kind === 'pve' && l.winner_id === discordId).length,
    companion_wins: mine.filter((l) => (l.participants || '').includes('companion:') && l.winner_id === discordId).length,
    knowledge: knowledge.length,
    private_knowledge: knowledge.filter((k) => k.scope === 'private').length,
    shares: db.prepare("SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND kind = 'knowledge_shared'").get(discordId).v,
    broadcasts: db.prepare("SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND kind = 'broadcast'").get(discordId).v,
    world_events: db.prepare('SELECT COUNT(*) v FROM world_events WHERE actor_id = ?').get(discordId).v,
    chapters: db.prepare('SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ?').get(discordId).v,
    votes: db.prepare('SELECT COUNT(*) v FROM global_votes WHERE discord_id = ?').get(discordId).v,
    wager_wins: db.prepare("SELECT COUNT(*) v FROM wagers WHERE kind='player' AND backer_id = ? AND status='won'").get(discordId).v,
    bonds: db.prepare('SELECT COUNT(*) v FROM bond_counters WHERE honored = 1 AND (a = ? OR b = ?)').get(discordId, discordId).v,
    rebirths: p?.rebirths || 0,
    wealth: p?.coins || 0,
    forewarns: db.prepare("SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice = 'forewarn'").get(discordId).v,
    ledger_cuts: db.prepare("SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ? AND choice = 'ledger_cut'").get(discordId).v,
    unusual: db.prepare("SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice IN ('lure','confront')").get(discordId).v
      + db.prepare("SELECT COUNT(*) v FROM chapter_participants WHERE discord_id = ? AND choice IN ('ledger_cut','confront')").get(discordId).v,
    refused: db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(discordId).some((r) => r.story_id === 'refused_nebula') ? 1 : 0,
    broken_contracts: db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND status = 'broken'").get(discordId).v,
    lost_sponsors: db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND status IN ('broken','failed')").get(discordId).v,
    completed_sponsors: db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND status = 'completed'").get(discordId).v,
    gate_sponsored: db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND constellation_id IN ('judge_fire','warden')").get(discordId).v,
    ledger_sponsored: db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND constellation_id IN ('trickster','broker')").get(discordId).v,
    renegade: (db.prepare("SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND choice = 'forewarn'").get(discordId).v > 0
      && db.prepare("SELECT COUNT(*) v FROM sponsorships WHERE discord_id = ? AND status = 'active'").get(discordId).v > 0) ? 1 : 0,
    asset_rank: neb && ['Faction Asset'].includes(neb.rank) ? 1 : 0,
    loyal_nebula: neb && neb.reputation >= 30 ? 1 : 0,
    solo_clears: db.prepare(`SELECT COUNT(*) v FROM scenario_log WHERE discord_id = ? AND outcome='success'`).get(discordId).v,
    favor_max: db.prepare('SELECT MAX(favor) v FROM constellation_favor WHERE discord_id = ?').get(discordId).v || 0,
    top_interest: db.prepare('SELECT MAX(interest) v FROM constellation_attention WHERE guild_id = ?').get(guildId).v || 0,
    divergence: 0, // filled by evaluate (needs canon module; kept explicit to avoid cycles)
    dokja_trusted: 0, // filled by evaluate
    trust_debt: Math.abs(Math.min(0, db.prepare('SELECT SUM(trust) v FROM npc_trust WHERE guild_id = ? AND discord_id = ?').get(guildId, discordId).v || 0)),
    stigma_max: db.prepare('SELECT COUNT(*) v FROM player_stigmas WHERE discord_id = ? AND level >= 3').get(discordId).v,
    merchant_rep: db.prepare('SELECT reputation FROM merchant_profiles WHERE guild_id = ? AND player_id = ?').get(guildId, discordId)?.reputation || 0,
    rival_fights: bestRival ? bestRival[1] : 0,
    rival_winning: bestRival && (rivalWins[bestRival[0]] || 0) > bestRival[1] / 2 ? 1 : 0,
  };
}
