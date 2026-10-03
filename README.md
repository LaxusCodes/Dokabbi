# Dokabbi — ORV Discord RPG

**Owner:** [LaxusCodes](https://github.com/LaxusCodes) 

A fan-made, ORV-inspired text RPG that lives entirely inside Discord. Players register an incarnation, survive server-wide scenarios, collect cards and characters, fight in PvE/PvP, found factions and shops, and write a shared history the whole server can read back.

> Fan project. Original text only — no copyrighted material from the novel or manhwa is included.

---

## Features.

- **Two command layers** — slash commands *and* a prefix router (`orv …`), with short aliases (`orv s`, `orv reg`, `orv rk`) and a `Jump to…` dropdown on hub screens.
- **Scenarios & chapters** — server-wide choices, parallel branches, Director verdicts, and branch collisions settled in shared combat.
- **Combat** — party PvE with focus/gambit/stigmas, PvP duels with ELO, and constellation-sponsored champion duels.
- **Progression** — levels, stigmas and hidden evolutions, titles (1 primary + 2 secondaries), seasons, and an incarnation record you can retire at your height.
- **Cards & characters** — card collection with showcases, character catalog with ranks, companions with closeness-gated dialogue, and a summon gacha.
- **Economy** — inventory, escrowed player market, merchant shops, auctions with instant-escrow bids, wagers, and constellation sponsorships.
- **Factions & social** — nebulae with agendas and reputations, parties (2–5), knowledge you can share or hoard, and a global feed of world events.
- **Kim Dokja** — he lives in this world too: observe, talk, ask, and hide knowledge from him.
- **Server admin** — play-channel gating, custom prefix, emoji overrides, season close, global votes, and an ambient Stream that speaks unprompted every 5 minutes.
- **Self-healing** — slash commands deploy on every boot; socket errors and expired interactions are logged, never fatal.

---

## Requirements

- **Node.js ≥ 22** (the DB layer uses the built-in `node:sqlite`)
- A Discord application + bot token ([Discord Developer Portal](https://discord.com/developers/applications))

---

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/LaxusCodes/Dokabbi.git
   cd Dokabbi
   npm install
   ```

2. **Create a `.env` in the project root** (it is gitignored):

   | Variable | Required | Default | Purpose |
   | --- | --- | --- | --- |
   | `DISCORD_TOKEN` | yes | — | Bot token |
   | `CLIENT_ID` | yes | — | Application (client) ID |
   | `GUILD_ID` | no | — | Guild for fast command registration |
   | `DATABASE_PATH` | no | `./data/starstream.db` | SQLite database location |
   | `PREFIX` | no | `orv` | Global prefix fallback |

3. **Invite the bot** — the bot needs the **Message Content** intent (enable it in the Developer Portal → Bot → Privileged Gateway Intents) and the `bot` + `applications.commands` scopes.

4. **Deploy and run**

   ```bash
   npm run deploy   # register slash commands (also runs automatically on boot)
   npm start
   ```

   On success you'll see: `Star Stream online as <bot> (prefix "orv")`.

---

## Usage

```
orv register Dokkaebi   # create your incarnation
orv tutorial            # guided initiation (replays your current step)
orv status              # your condition window
orv daily               # today's contracts + streak
orv help                # 7-page control panel
```

Slash commands mirror the prefix set — try `/profile`, `/pve`, `/market browse`, `/titles view`.

Admin-only configuration lives under `/stream` (`set-channel`, `set-play`, `set-prefix`, `clear-play`, …) and `/emoji` (`set`, `clear`, `list`).

---

## Commands at a glance

| Category | Examples |
| --- | --- |
| Self | `register`, `status`, `profile`, `journey`, `incarnation`, `tutorial`, `daily` |
| Records | `collection`, `titles`, `rankings`, `compare`, `know` |
| Survival | `pve`, `pvp`, `encounter`, `observe`, `chapter`, `dokja` |
| World | `scenario`, `world`, `stream`, `server`, `season`, `starstream`, `canon`, `global` |
| Economy | `market`, `shop`, `auction`, `sponsor`, `wager`, `summon` |
| Social | `party`, `nebula`, `duel`, `audience`, `emoji`, `stigma` |

Run `orv help` in Discord for the full categorized list with aliases.

---

## Development

```bash
npm test    # 33 test files: engine, phases, lifecycle, integration, UX, …
```

### Project layout

```
src/
  index.js           client bootstrap, interaction router, ambient pump
  prefix.js          `orv …` message router + aliases
  deploy-commands.js slash command registration
  commands/          one file per slash command
  game/              systems — scenarios, combat, economy, titles, sponsors, …
  database/          node:sqlite schema + migrations
  utils/             embeds, menus, card renderer, canvas images
test/                node:test suites
```

---

## Tech stack

`discord.js` v14 · `@napi-rs/canvas` · `zod` · `dotenv` · `node:sqlite` (WAL)

---

## Contributing

Issues and PRs are welcome. Keep text original, run `npm test` before opening a PR, and follow the existing one-file-per-command layout.

## License

No license file has been published yet — all rights reserved by the owner unless otherwise stated.

---

Built and maintained by **[LaxusCodes](https://github.com/LaxusCodes)**.
