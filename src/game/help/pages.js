import { ContainerBuilder } from 'discord.js';
import { pageRow } from '../../utils/interactions.js';
import { td, sep, sepGap, headerText, V2, LEVELS } from '../../utils/v2.js';

// Star Stream control panel: categorized, paginated, beginner-first.
// One screen = one purpose — no Jump menu here, only [◀][▶].
// Aliases stay hidden (power-user shortcuts, not taught).
export const HELP_TOTAL = 7;

function section(icon, title, rows) {
  return [`**${icon} ${title}**`, ...rows.map(([cmd, why]) => `\`${cmd}\` — ${why}`)].join('\n');
}

function pageBody(page, prefix) {
  const p = (cmd) => `${prefix} ${cmd}`;
  switch (page) {
    case 0:
      return (
        'The Stream responds to `orv` commands. Use them to inspect your incarnation, survive scenarios, and shape your history.\n' +
        '\n**New here? Start here:**\n' +
        `1  \`${p('register')} <name>\` — Become an incarnation\n` +
        `2  \`${p('tutorial')}\` — Learn how the Stream works\n` +
        `3  \`${p('status')}\` — Check your life\n` +
        `4  \`${p('character browse')}\` — Browse all characters\n` +
        `5  \`${p('daily')}\` — Today\'s contracts\n` +
        `6  \`${p('know list')}\` — What you know\n` +
        '\nThe Stream remembers what you do.'
      );
    case 1:
      return section('📋', 'SELF', [
        [p('register <name>'), 'Create your incarnation'],
        [p('status'), 'See your current condition'],
        [p('profile [who]'), 'View your or someone\'s identity'],
        [p('journey'), 'See the Stories you lived'],
        [p('incarnation record'), 'Your full incarnation record'],
        [p('incarnation legacy'), 'Retire at your height'],
        [p('tutorial'), 'Replay your initiation thread'],
        [p('daily [view|claim|streak]'), 'Today\'s contracts and streak'],
        [p('know list'), 'What knowledge you hold'],
        [p('know share <id> <scope>'), 'Share knowledge with others'],
        [p('character browse [rank]'), 'Browse the character catalog'],
        [p('character info <id>'), 'Inspect a character\'s dossier'],
        [p('character recruit'), 'Draw a random character'],
        [p('stigma'), 'Your stigma mastery and evolutions'],
        [p('summon'), 'Draw a card from the stream'],
      ]);
    case 2:
      return section('🏆', 'RECORDS', [
        [p('collection view [who]'), 'See your gathered cards'],
        [p('collection inspect <id>'), 'Inspect a single card'],
        [p('collection showcase [id]'), 'Flex your showcase cards'],
        [p('titles view'), 'Earned epithets and progress'],
        [p('titles equip <primary> <s1> <s2>'), 'Set your active titles'],
        [p('rankings'), 'Top 10 by level and coins'],
        [p('compare <first> <second>'), 'Two incarnations side by side'],
      ]);
    case 3:
      return (
        section('⚔️', 'SURVIVAL', [
          [p('pve <monster> [focus]'), 'Fight a monster in party combat'],
          [p('encounter'), 'Discover a random event'],
          [p('observe <focus>'), 'Investigate for hidden knowledge'],
          [p('chapter current'), 'Show the open chapter'],
          [p('chapter decide <path>'), 'Walk a path'],
          [p('chapter branches'), 'All parallel branches'],
          [p('dokja look'), 'Observe Kim Dokja'],
          [p('dokja talk'), 'Talk to Kim Dokja'],
          [p('dokja ask'), 'Ask him what he knows'],
        ]) +
        '\n\n' +
        section('🌍', 'WORLD', [
          [p('scenario current'), 'Enter the current scenario'],
          [p('scenario decide <choice>'), 'Make a choice'],
          [p('world history'), 'Recent world events'],
          [p('world timeline'), 'The server\'s own Story'],
          [p('world stream'), 'Live Star Stream feed'],
          [p('stream status'), 'Show this server\'s stream'],
          [p('server'), 'What this server is famous for'],
          [p('season status'), 'Current season details'],
          [p('starstream channel'), 'Live channel overview'],
          [p('starstream rankings'), 'Rankings by attention'],
          [p('canon status'), 'Divergence score and canon pressure'],
          [p('canon timeline'), 'Milestones: expected vs actual'],
        ])
      );
    case 4:
      return (
        section('💰', 'ECONOMY', [
          [p('market browse'), 'Open listings on this server'],
          [p('market sell <item> <qty> <price>'), 'List unequipped inventory'],
          [p('market buy <id>'), 'Buy a listing now'],
          [p('market history'), 'Your past trades'],
          [p('shop create <name>'), 'Open your merchant stall'],
          [p('shop view [who]'), 'View a merchant\'s shop'],
          [p('auction create <item> <qty> <price>'), 'Auction unequipped goods'],
          [p('auction bid <id> <amount>'), 'Place a bid'],
          [p('wager <side> <amount>'), 'Back an outcome in a global vote'],
        ])
      );
    case 5:
      return (
        section('👥', 'PEOPLE & FACTIONS', [
          [p('party create <name>'), 'Found a party'],
          [p('party join <id>'), 'Join a party'],
          [p('party role <role>'), 'Set your combat role'],
          [p('duel call <challenger> <defender> <cause>'), 'Demand two constellations settle it'],
          [p('duel join <side>'), 'Fight as a champion'],
          [p('duel fight'), 'Begin the duel'],
          [p('pvp challenge <opponent>'), 'Challenge a registered player'],
          [p('pvp rank'), 'Show PvP ELO rankings'],
          [p('sponsor status'), 'Your contract and loyalty'],
          [p('sponsor offers'), 'Constellations considering you'],
          [p('sponsor inspect <constellation>'), 'Check if a constellation would consider you'],
          [p('audience'), 'Who the stream favors'],
          [p('team card'), 'Your living team card'],
          [p('nebula list'), 'Known factions of the stream'],
          [p('nebula join <id>'), 'Swear to a faction'],
        ])
      );
    default:
      return (
        section('🔧', 'ADMIN', [
          [p('global start <scenario> <a> <b>'), '(Admin) Open a global vote'],
          [p('global vote <choice>'), 'Cast your vote'],
          [p('global resolve'), '(Admin) Close the vote and change the world'],
          [p('stream advance <scenario>'), '(Admin) Move the server stream'],
          [p('stream set-channel <channel>'), '(Admin) Set the Stream\'s channel'],
          [p('stream set-prefix <prefix>'), '(Admin) Set a custom prefix'],
          [p('chapter advance'), '(Admin) Close this chapter'],
          [p('season close'), '(Admin) End the season'],
          [p('emoji set <key> <value>'), '(Admin) Override an emoji'],
          [p('character set-image <id> <url>'), '(Admin) Set a character\'s art URL'],
        ]) +
        '\n\n' +
        section('📖', 'MORE', [
          [p('canon divergence'), 'What broke vs what held'],
          [p('dokja card'), 'His character card as you know it'],
          [p('dokja canon'), 'How he compares canon to this timeline'],
          [p('dokja hide'), 'Hide your knowledge from him'],
          [p('sponsor break'), 'Break your contract'],
          [p('sponsor negotiate <offer> <term>'), 'Bargain terms'],
          [p('sponsor expectations'), 'Your live expectation progress'],
          [p('starstream universe'), 'The global Star Stream'],
          [p('starstream global'), 'Trending across every server'],
          [p('starstream anomalies'), 'Servers where canon is breaking'],
          [p('starstream fame'), 'Many kinds of famous'],
          [p('starstream presence <constellation>'), 'Every server a constellation watches'],
          [p('stream set-play <channel>'), '(Admin) Set the bot\'s play channel'],
        ])
      );
  }
}

export function renderHelpPage(page, prefix = 'orv') {
  const safe = Math.max(0, Math.min(page, HELP_TOTAL - 1));
  const container = new ContainerBuilder().setAccentColor(LEVELS.system.accent);
  container.addTextDisplayComponents(td(headerText({ icon: '🌌', kicker: '🌌 STAR STREAM', title: `Command Guide • ${safe + 1}/${HELP_TOTAL}` })));
  container.addSeparatorComponents(sep());
  container.addTextDisplayComponents(td(pageBody(safe, prefix)));
  return { components: [container, pageRow('help', safe, HELP_TOTAL)], flags: V2 };
}
