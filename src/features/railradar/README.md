# RailRadar Train Info

Answers Indian Railways queries posted as comment commands, using the
[RailRadar](https://railradar.in) API.

The feature exists to absorb the repetitive passenger questions that otherwise
get answered by hand: where is my train, will my waitlist confirm, what runs on
this route.

## Commands

Put a command at the **start of a line** in any comment.

| Command              | Aliases                                        | What it returns                                         |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `!live 12951`        | `!status` `!running` `!delay` `!late` `!where` | Live running status, delay, current location, next halt |
| `!train 12951`       | `!schedule` `!sched` `!timetable` `!tt`        | Train profile, run days, speeds and halt timetable      |
| `!between NDLS MMCT` | `!trains`                                      | Direct trains between two stations                      |
| `!pnr 1234567890`    | `!ticket`                                      | Aggregate booking status and confirmation chance        |
| `!help`              | `!commands` `!railradar`                       | Command reference                                       |
| `!rail <anything>`   | `!route`                                       | Infers intent from the argument shape                   |

### Input handling

- Trains accept a **number or a name** (`!live rajdhani` resolves via lookup search).
- Stations require **codes** (`NDLS`, `MMCT`). See "Station names" below.
- `to` is optional: `!between NDLS MMCT` and `!between NDLS to MMCT` both work.
- Dates accept `today`, `tomorrow`, `yesterday`, `YYYY-MM-DD`, `DD-MM-YYYY`.
- Only the **first** command in a comment is processed.
- A command must begin a line, so prose like "trains here are never !live" and
  quoted bot replies (`> !live 12951`) never trigger the bot.

### Station names (deferred)

`!between` takes station **codes** only for now. RailRadar is building a better
search engine; until it ships, the v1 station search is not accurate enough to
guess on a user's behalf:

- searching `"mumbai"` ranks `LTT` above `MMCT`;
- `MMCT`, `BCL` and `BCT` are all named "Mumbai Central", and only `MMCT`
  carries traffic, so picking the wrong one silently returns zero trains.

`TODO(station-names)` in `resolve.ts` tracks the follow-up. When the new search
API lands, replace `validateStationCode` with a resolver returning a ranked
match plus alternatives, and drop the city-wide fallback in
`commands/between.ts`.

Until then, if an exact-code search returns nothing the handler retries
**city-wide** (`byCity=true`) instead of dead-ending on "no trains". Rows where
the train actually calls at a different station in the same city are annotated
`@CODE`, so times can never be misread as belonging to the station the user
named.

## Privacy: PNR handling

`!pnr` deliberately reports **aggregate status only**:

- The PNR is masked in the reply (`1234****90`).
- Coach and berth numbers are **never** printed, and are not even modelled in
  `types.ts`.
- Passenger names are not returned by the API and never displayed.

Anyone can pass any 10-digit number to this command. Printing coach and berth
would turn the bot into a tool for locating a specific stranger on a specific
train. The aggregate view still answers the question people actually ask.

Moderators can disable the command entirely with `railradarPnrEnabled`.

## Settings

Subreddit settings:

| Setting                      | Default | Purpose                                                                    |
| ---------------------------- | ------- | -------------------------------------------------------------------------- |
| `railradarEnabled`           | `false` | Master switch. Off by default so a fresh install never replies unprompted. |
| `railradarPnrEnabled`        | `true`  | Allow `!pnr` lookups.                                                      |
| `railradarCooldownSeconds`   | `30`    | Minimum gap between commands from one user.                                |
| `railradarMaxRepliesPerPost` | `10`    | Cap bot replies under a single post.                                       |
| `railradarDailyLimit`        | `2000`  | Subreddit-wide daily ceiling (cost circuit breaker).                       |

App secret (global):

| Secret            | Purpose                              |
| ----------------- | ------------------------------------ |
| `railradarApiKey` | Bearer token for `api.railradar.in`. |

Set the key with:

```bash
npx devvit settings set railradarApiKey
```

## Fetch Domains

| Domain             | Purpose                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.railradar.in` | Indian Railways data: live train running status, timetables, station-to-station searches and PNR status. This is the only external service the feature contacts. All requests are server-side `GET`s authenticated with a bearer token held in the `railradarApiKey` app secret. No user data is sent to it beyond the train number, station code or PNR the user typed in their own comment. |

## Reliability and cost controls

- **Recursion guard.** Bot replies contain literal `!command` hints in their
  footer, so the handler ignores comments authored by the app account. Without
  this the bot would answer its own footers indefinitely.
- **Idempotency.** Devvit does not guarantee once-only trigger delivery, so each
  comment id is claimed atomically with `hSetNX` before any reply is posted.
- **Caching.** Live status 90s, timetables 24h, lookups 7d, routes 6h,
  PNR 60s, predictions 30m.
- **Graceful failures.** Upstream error codes map to plain sentences. The nightly
  Indian Railways PRS maintenance window (23:45–00:20 IST) is reported as
  maintenance with a retry time rather than as an error.
- **Honest labelling.** When the API reports `isLive: false` or a
  non-`real-time` tracking mode, the reply says the data is estimated.

## Layout

```text
railradar/
├── client.ts        # authenticated fetch + envelope unwrapping
├── cache.ts         # Redis read-through cache with TTL tiers
├── errors.ts        # upstream failure -> user-facing sentence
├── idempotency.ts   # atomic per-comment claim
├── parse.ts         # comment body -> command (pure)
├── ratelimit.ts     # cooldown, per-post cap, daily breaker
├── resolve.ts       # free text -> validated train/station code
├── settings.ts      # feature settings and API key access
├── text.ts          # markdown-safe string helpers
├── time.ts          # IST date/time helpers (pure)
├── types.ts         # API response types
├── validate.ts      # domain format rules (pure, no imports)
├── triggers.ts      # comment trigger entry point
├── commands/        # one module per command + dispatcher
└── render/          # markdown renderers (pure)
```

`parse.ts`, `render/*`, `text.ts`, `time.ts`, `errors.ts`, `validate.ts` and
`pickTrain`/`validateStationCode` in `resolve.ts` are pure, so the risky logic is
unit tested without any network or Redis access.

`validate.ts` owns every identifier pattern (train number, station code, PNR) so
the rules are defined once and reused by the parser, the resolver and the PNR
command. It intentionally has no imports, which is what lets the pure parser be
tested without loading the Devvit runtime.

## Removing this feature

1. Delete `src/features/railradar/`.
2. Remove the `railradar:on-comment-submit` entry from
   `src/routes/triggers.ts`.
3. Remove the `railradar*` settings and the `permissions.http` block from
   `devvit.json`.
