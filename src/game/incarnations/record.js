import { getDb } from '../../database/db.js';
import { getPlayer } from '../players/model.js';
import { getPlayerParty } from '../parties/store.js';
import { memberOf } from '../nebulas/store.js';
import { activeContract, completedCount } from '../sponsors/contracts.js';
import { relationshipState } from '../characters/relationships.js';
import { npcTrustFor } from '../world/store.js';
import { epithets } from './lifecycle.js';

// One persistent identity assembled from every system. No badges — a life.
export function assembleRecord(discordId, guildId) {
  const db = getDb();
  const p = getPlayer(discordId);
  if (!p) return null;
  const stories = db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(discordId).map((r) => r.story_id);
  const cards = db.prepare('SELECT card_id, name, power FROM story_cards WHERE discord_id = ?').all(discordId);
  const party = getPlayerParty(discordId);
  const neb = memberOf(discordId, guildId);
  const contract = activeContract(discordId);
  const doneSponsors = db.prepare(`SELECT DISTINCT constellation_id FROM sponsorships WHERE discord_id = ? AND status IN ('completed','ended')`).all(discordId).map((r) => r.constellation_id);
  const log = db.prepare('SELECT choice, outcome, scenario_id FROM scenario_log WHERE discord_id = ? ORDER BY id DESC LIMIT 12').all(discordId);
  const chapters = db.prepare('SELECT cp.choice, ci.chapter_no FROM chapter_participants cp JOIN chapter_instances ci ON ci.id = cp.chapter_id WHERE cp.discord_id = ? ORDER BY ci.chapter_no DESC LIMIT 8').all(discordId);
  const alters = db.prepare('SELECT COUNT(*) v FROM world_events WHERE actor_id = ? AND kind = ?').get(discordId, 'scenario_altered').v;
  const trusts = db.prepare('SELECT npc_id, trust FROM npc_trust WHERE guild_id = ? AND discord_id = ?').all(guildId, discordId);
  const dokja = relationshipState(guildId, 'kim_dokja', discordId);
  const companion = db.prepare('SELECT character_id FROM companions WHERE discord_id = ?').get(discordId)?.character_id || null;
  const titles = epithets({
    alters,
    sponsored: Boolean(contract) || doneSponsors.length > 0,
    trusted: contract ? completedCount(discordId, contract.constellation_id) >= 1 : false,
    underdog: cards.some((c) => c.card_id.includes('underdog')),
    asset: stories.includes('nebula_asset'),
    bonded: stories.includes('survived_together'),
    refused: stories.includes('refused_nebula'),
    defied: stories.includes('defied_probability'),
    rebirthed: p.rebirths || 0,
  });
  return { p, stories, cards, party, neb, contract, doneSponsors, log, chapters, alters, trusts, dokja, titles, companion };
}

export function recordText(r) {
  if (!r) return 'No such incarnation.';
  const { p } = r;
  const affil = [
    r.party ? r.party.party.name : null,
    r.neb ? r.neb.nebula.name : null,
  ].filter(Boolean);
  const sponsors = [r.contract?.constellation_id, ...r.doneSponsors].filter(Boolean);
  const knownBy = [`Kim Dokja (${r.dokja})`, ...r.trusts.filter((t) => Math.abs(t.trust) >= 10).map((t) => `${t.npc_id} (${t.trust > 0 ? '+' : ''}${t.trust})`)];
  const major = [
    ...r.log.filter((l) => ['forewarn', 'lure', 'help'].includes(l.choice)).slice(0, 4).map((l) => `${l.choice} @${l.scenario_id} (${l.outcome})`),
    ...r.chapters.map((c) => `${c.choice} (CH${c.chapter_no})`),
  ].slice(0, 6);
  return [
    '🎴 INCARNATION RECORD', '',
    `${p.name} — *${p.title}*  •  ${p.status || 'alive'} (deaths ${p.deaths || 0}, rebirths ${p.rebirths || 0})`,
    `Level ${p.level}  •  ${p.coins} coins  •  Scenario #${p.scenario_progress}`,
    titlesLine(r.titles),
    '',
    '__Stories__',
    r.stories.length ? r.stories.map((s) => `• [${s}]`).join('\n') : '_None yet._',
    '',
    '__Affiliations__',
    affil.length ? affil.map((a) => `• ${a}`).join('\n') : '_Sworn to none._',
    '',
    '__Sponsors__',
    sponsors.length ? sponsors.map((s) => `• ${s}`).join('\n') : '_None._',
    '',
    '__Companion__',
    r.companion ? `• ${r.companion}` : '_Walks alone._',
    '',
    '__Known by__',
    knownBy.length ? knownBy.map((k) => `• ${k}`).join('\n') : '_No one of note._',
    '',
    '__Major choices__',
    major.length ? major.map((m) => `• ${m}`).join('\n') : '_Nothing history-worthy yet._',
    '',
    '__Cards__',
    r.cards.length ? r.cards.slice(0, 8).map((c) => `🎴 ${c.name}`).join('\n') + (r.cards.length > 8 ? `\n_…and ${r.cards.length - 8} more._` : '') : '_None._',
  ].join('\n');
}

function titlesLine(titles) {
  return titles.length ? `_${titles.join(' • ')}_` : '_Unremarkable — for now._';
}
