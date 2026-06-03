# RNSquadJS

A multi-server management daemon for [Squad](https://joinsquad.com/) dedicated
servers. It connects to a server over RCON, tails the server log, and runs a set
of plugins for moderation, voting, team balancing, statistics and a fair
skill-rating (ELO) system.

This is a TypeScript fork of
[SquadJS](https://github.com/Team-Silver-Sphere/SquadJS) with several additions:

- **Multiple servers** from a single process and config file.
- **Built-in maps and mods** support (layer/faction/unit-type data in
  `layers.json`).
- **Typed plugin contract** (`definePlugin` + zod options) with automatic
  resource cleanup and error isolation.
- **Player rating** based on Glicko-2 with a fair "against-the-field" model.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- [Yarn](https://classic.yarnpkg.com/) 1.22+
- MongoDB (for `rnsStats`, ratings and match history)
- Optional: MariaDB (for `officialKothDb`)

## Installation

```bash
git clone <repo-url>
cd RNSquadJS
yarn install
```

Create a `config.json` in the project root (see
[config.example.json](./config.example.json)), then start it:

```bash
yarn start:dev    # development (ts-node + nodemon)
yarn start:prod   # build then run from lib/
```

## Configuration

The config is a JSON object keyed by server id. Each server entry:

| Field            | Description                                              |
| ---------------- | ------------------------------------------------------- |
| `host`           | RCON host (server IP).                                  |
| `port`           | RCON port.                                              |
| `password`       | RCON password.                                          |
| `logFilePath`    | Path to `SquadGame.log`.                                |
| `adminsFilePath` | Path to `Admins.cfg`.                                   |
| `mapsName`       | Maps data file name (e.g. `vanilla.json`).              |
| `db`             | MongoDB connection string (optional).                   |
| `database`       | MongoDB database name (optional).                       |
| `mapsRegExp`     | Regex used to parse layer names (optional).             |
| `ftp`            | `{ username, password }` for SFTP log access (optional).|
| `plugins`        | Array of `{ name, enabled, options }`.                  |

Each server writes to its own database: set a different `db`/`database` per
server and its stats, ratings and smart-balance data go to that database.
Servers that share the same `db` + `database` reuse a single connection (handy
for one shared leaderboard across servers).

Running multiple servers is just multiple top-level keys:

```json
{
  "1": { "host": "127.0.0.1", "port": 21114, "plugins": [] },
  "2": { "host": "127.0.0.1", "port": 21124, "plugins": [] }
}
```

### Secrets via environment variables

Any value in `config.json` may reference an environment variable with
`${ENV_VAR}`. Values are taken from the process environment or a local `.env`
file (copy from `.env.example`). Both `config.json` and `.env` are gitignored.

```json
{ "password": "${RCON_PASSWORD}", "db": "${MONGO_URI}" }
```

## Plugins

Enable a plugin by adding it to a server's `plugins` array with
`"enabled": true`. Options not listed fall back to defaults. See
[config.example.json](./config.example.json) for every option.

| Plugin               | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `rnsStats`           | Player stats, match history and Glicko-2 rating into MongoDB.            |
| `rnsLogs`            | Per-match JSON event logs written to disk.                               |
| `rnsTelemetry`       | CSV telemetry snapshots + anomaly detection (rapid kills, mass TK, etc). |
| `officialKothDb`     | Syncs KOTH stats to a MariaDB database.                                  |
| `broadcast`          | Periodic in-game messages (only when players are online).               |
| `knifeBroadcast`     | Announces knife kills in chat.                                           |
| `autorestartServers` | Restarts an empty server once its min uptime has passed.                |
| `fobExplosionDamage` | Kicks/warns players who blow up their own FOB/HAB.                       |
| `adminsReloadConfig` | Reloads `Admins.cfg` on change (debounced).                             |
| `bonuses`            | Awards points for time on the server (seed/classic).                    |
| `warnPlayers`        | Reminders on connect, squad creation, role change and team kills.       |
| `explosiveDamaged`   | Handles explosive friendly-damage rules.                                |
| `squadLeaderRole`    | Requires the SL kit, disbands the squad otherwise.                      |
| `autoKickUnassigned` | Kicks players with no squad after warnings (grace period on join).      |
| `adminCamBlocker`    | Kicks from squad players who entered admin cam and rejoined.            |
| `levelSync`          | Writes KOTH levels into a prefix `.cfg`.                                |
| `autoUpdateMods`     | Auto-updates Workshop mods and restarts the docker service.             |
| `voteMap`            | Vote to switch to a vanilla map.                                        |
| `voteMapMods`        | Vote to switch to a modded map.                                         |
| `skipmap`            | Vote to skip the current map.                                           |
| `chatCommands`       | Chat commands: `!admins !report !stvol !roll !fix !discord !stats !help`.|
| `randomizerMaps`     | Randomizes maps, factions and unit types on a new game.                 |
| `smartBalance`       | Balances teams by headcount and skill, keeping clans/parties together.  |

## Player rating (ELO)

`rnsStats` maintains a per-player skill rating based on **Glicko-2**. Instead of
a single number it stores rating (`mu`), uncertainty (`rd`) and volatility
(`sigma`), so new players calibrate quickly and inactivity is handled correctly.

Key design choices:

- **Against the field.** A player's match score is driven by personal
  performance relative to the whole lobby, not just the win/loss. A hard carry on
  a weak 50-player team still climbs.
- **Victim-weighted kills.** Killing a higher-rated player is worth more than
  killing a weaker one.
- **Support is rewarded.** Time spent in logistics/transport/helicopters and in
  crewed combat vehicles (plus driver/pilot crew-assists) adds to a player's
  impact, and a clean support game (no team kills) cannot sink the rating on a
  win. Team killers get no such protection.
- **Conservative display.** The shown rating is `mu - 2*rd` by default.

`rnsStats` options:

| Option           | Default          | Description                                          |
| ---------------- | ---------------- | ---------------------------------------------------- |
| `eloEnabled`     | `true`           | Enable rating updates at round end.                  |
| `eloMinPlayers`  | `10`             | Minimum participants for a match to be rated.        |
| `eloDisplayMode` | `"conservative"` | `"conservative"` (`mu - 2*rd`) or `"mu"` (raw).      |

Seed layers are never rated.

## Team balancing (smartBalance)

`smartBalance` evens out the teams at round end in priority order: exact
headcount (50/50) → spread stacked clans across sides → balance commanders →
balance player skill. Squads, detected friend-parties and individual clans are
always moved whole (never split); only different clans are distributed. Skill comes
from the same **Glicko-2 rating** as the ELO system (`rating.mu`), with a
heuristic fallback for players who aren't rated yet. Leadership is balanced as a
separate axis using dedicated **command** and **squad-leader** Glicko ratings
(`cmdRating`/`slRating`, maintained at round end): each player's expected
leadership contribution is their role rating weighted by how often they actually
take that role, so players who rarely lead don't skew the balance.

Notable options (see [config.example.json](./config.example.json) for all):

| Option                    | Default | Description                                                    |
| ------------------------- | ------- | -------------------------------------------------------------- |
| `autoBalance`             | `false` | Balance automatically at the end of every round.              |
| `teamCap`                 | `50`    | Max players per team.                                          |
| `skillTolerancePct`       | `0.05`  | Target skill gap between teams (fraction of total skill).      |
| `balanceLeadership`       | `true`  | Also even out leadership (commander/SL) strength across teams. |
| `leadTolerance`           | `150`   | Target leadership gap between teams.                          |
| `clanMaxStackPerSide`     | `6`     | Split a clan stacked on one side into chunks of this size.     |
| `skillMinGames`           | `3`     | Min rated games before `rating.mu` is used instead of the fallback. |
| `refreshSkillEachBalance` | `true`  | Re-read ratings before each balance so values stay current.   |
| `protectCommander`        | `true`  | Never move the commander (manual mid-round balance).         |
| `protectSquadLeader`      | `true`  | Never move squad leaders (manual mid-round balance).        |
| `protectAtRoundEnd`       | `false` | Keep protections during the round-end balance too. Off by default so headcount always reaches an exact 50/50. |

Headcount (exact 50/50) is always enforced — skill/leadership swaps are what
`swapLimitPerRound` caps, never the moves that even out the team sizes.

Friends are detected from a **social graph**: time spent together in a squad
(`partyMinSec`) across at least `partyMinMatches` distinct matches builds a
weighted edge, decayed over time. Groups are extracted as dense cores (not
arbitrary chains), so real premades — including full 7–9-man squads — are kept
on the same team during balancing.

Manual control is also available via the `chatCommands` `!balance` / `!balanceoff`
commands.

## Development

```bash
yarn test          # Vitest
yarn lint:check    # tsc --noEmit + eslint + prettier --check
yarn lint:format   # eslint --fix + prettier --write
yarn new:plugin myPlugin
```

CI runs typecheck, lint, format and tests on every push and pull request. See
[CONTRIBUTING.md](./CONTRIBUTING.md).
