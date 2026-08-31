# RailRadar Bot — Progress & Forward Guide

Status doc for the RailRadar Train Info feature in the `railradarinfo` Devvit app.
Target community: r/indianrailways (~400k weekly visitors).

**Last updated:** 2026-08-30

---

## 1. Status at a glance

| Area                         | State                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| Feature code                 | ✅ Complete                                                  |
| Type-check / lint            | ✅ Clean                                                     |
| Unit tests                   | ✅ 129/129 passing                                           |
| Production build             | ✅ `dist/server/index.cjs` (~1.5 MB), RailRadar code bundled |
| Live API verification        | ✅ All commands verified against `api.railradar.in`          |
| Devvit runtime integration   | ❌ **Never executed** — see §5                               |
| Domain allowlist             | 🚧 Not requested yet — blocks all fetches                    |
| Terms & Privacy Policy       | 🚧 Not published — blocks `devvit publish`                   |
| Deployed to r/indianrailways | ❌ No                                                        |

**Verdict:** ready to _playtest_ immediately; **not** ready to publish.

---

## 2. What is built

Commands are triggered by a `!verb` at the **start of a line** in any comment.

| Command             | Aliases                                        | Returns                                        |
| ------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `!live 12951`       | `!status` `!running` `!delay` `!late` `!where` | Live status, delay, location, next halt ETA    |
| `!train 12951`      | `!schedule` `!sched` `!timetable` `!tt`        | Profile, run days, speeds, halt timetable      |
| `!between UJN INDB` | `!trains`                                      | Direct trains between two stations             |
| `!pnr 1234567890`   | `!ticket`                                      | Aggregate booking status + confirmation chance |
| `!help`             | `!commands` `!railradar`                       | Command reference                              |
| `!rail <anything>`  | `!route`                                       | Infers intent from argument shape              |

Input handling: train **names or numbers**; stations **codes only** (see §7);
dates accept `today` / `tomorrow` / `yesterday` / `YYYY-MM-DD` / `DD-MM-YYYY`;
only the first command per comment is processed.

---

## 3. Verification evidence

Ran the real compiled parser and renderers against production data.

**Trains:** `11272`, `11271` (both live, `trackingMode=real-time`), `12423` via
name search (`!live rajdhani`), full schedules for 11271/11272 (40 halts,
truncation verified with destination preserved).

**Routes:** `UJN → INDB` and `INDB → UJN` (43 trains each), `UJN → INDB tomorrow`
(24 trains — day-of-week filtering confirmed).

**PNR:** real booking verified end to end, including privacy assertions checked
programmatically (full PNR absent, mask present, zero sensitive values leaked).

**Error paths:** `404 TRAIN_NOT_FOUND`, `400 VALIDATION_ERROR`, same-station
short-circuit, prose with no command, and quoted bot replies (`> !live ...`)
correctly ignored.

**Result:** zero field mismatches, zero exceptions.

---

## 4. Bugs found by live testing

These were all invisible to unit tests written from the OpenAPI spec. Recorded
because they show the spec cannot be trusted as the contract.

| #   | Bug                                                                                                                  | Fix                                                |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `!pnr` crashed on **every** call — spec's `journey` object does not exist                                            | Types rebuilt from real response                   |
| 2   | ETA showed timetable time + raw delay (`ETA 20:40 (+106)` at 22:13 — a past time)                                    | Show expected arrival: `ETA 22:26 (1h 46m late)`   |
| 3   | `NOT_FOUND` never matched — API returns `TRAIN_NOT_FOUND`                                                            | Match on suffix via `isNotFoundCode`               |
| 4   | Station **names** passed the code pattern (`INDORE`), API returned 200-with-0-trains → looked like "no trains exist" | Empty result now hints to use codes                |
| 5   | `!live` named current location from `previousHalt` → "At Kota Jn" while standing elsewhere                           | Resolve name from the location's own `stationCode` |
| 6   | Probability label used `header` ("Waiting List #28") instead of `probabilityStatus` ("MEDIUM")                       | Rendered as distinct facts                         |

---

## 5. Not verified — read before deploying

Everything touching the Devvit runtime has **never run**. It cannot execute
outside the platform.

| Untested                                            | Failure mode if broken                       |
| --------------------------------------------------- | -------------------------------------------- |
| `onCommentSubmit` trigger firing                    | Bot never responds                           |
| `comment.reply({ runAs: 'APP' })`                   | Commands parse but nothing posts             |
| `reddit.getAppUser()`                               | Guard fails safe → bot silently does nothing |
| `settings.get()`                                    | Feature reads as disabled                    |
| Redis `cached` / `checkAndConsume` / `claimComment` | Duplicate replies, or everything blocked     |

Unit tests cover the **pure predicates** inside these (guard ordering, limit
boundaries, URL building, envelope parsing) — not the I/O calls.

**Playtest is what closes this gap.** Expect first-run issues here, not in
parsing or rendering.

---

## 6. Deployment checklist

Ordered. Steps 1–2 are the long pole — start them first.

- [ ] **1. Upload to start the domain review.** Approval takes 1–2 business days
      and is triggered by upload/playtest. Until it clears, every command fails.
      `bash
    npm run login
    npx devvit upload
    `
- [ ] **2. Publish Terms & Privacy Policy** and add both URLs to the app details
      form. Mandatory for any app using fetch.
- [ ] **3. Set the API key.** Requires an installation to exist, so it must come
      after step 1.
      `bash
    npx devvit settings set railradarApiKey
    npx devvit settings list
    `
- [ ] **4. Playtest.** Playtest subs must have <200 subscribers, so this cannot
      be r/indianrailways.
      `bash
    npm run dev
    `
- [ ] **5. Enable the feature** in the playtest sub's app settings. It ships
      **off** deliberately.
- [ ] **6. Smoke test:** `!help`, `!live 12951`, `!train 12951`,
      `!between UJN INDB`, `!pnr <your own>`, plus failure cases
      (`!live 99999`, `!between UJN UJN`, two commands within 30s).
- [ ] **7. Set display name** to "RailRadar Bot" and add
      `marketingAssets.icon` (1024×1024 PNG).
- [ ] **8. Publish for review** (1–2 business days), keep unlisted.
      `bash
    npx devvit publish
    `
- [ ] **9. Install on the real sub.**
      `bash
    npx devvit install r/indianrailways
    `
- [ ] **10. Rotate the API key** — the current one was shared in a chat log.

Debugging: `npx devvit logs r/<sub> --verbose`. All handler logs use a
`[railradar]` prefix.

---

## 7. Deferred work

### Station names in `!between` — `TODO(station-names)`

Blocked on RailRadar's new search engine. The v1 station search is not accurate
enough to guess on a user's behalf:

- `"mumbai"` ranks `LTT` above `MMCT`
- `MMCT`, `BCL` and `BCT` are all named "Mumbai Central" — only `MMCT` carries
  traffic, so choosing wrong silently returns zero trains

**When the v2 search API ships:** replace `validateStationCode` in `resolve.ts`
with a resolver returning a ranked match plus alternatives, then remove the
city-wide fallback in `commands/between.ts` and the `@CODE` annotation legend in
`render/between.ts`.

Interim behaviour: exact codes are honoured; if that returns nothing, the search
retries city-wide (`byCity=true`) and annotates rows with `@CODE` where the train
calls at a different station in the same city.

### Backlog, roughly by value-to-effort

**High value, low effort**

- `!code delhi` → list station codes for a city. Removes the main friction of
  the codes-only limitation and is a single search call.
- Duplicate-query suppression: if the same train was asked recently, link the
  existing reply instead of posting a fresh one. Cuts noise and API spend.

**High value, medium effort**

- `!coach 12952 BVI` — platform coach position. Genuinely hard to find
  elsewhere and serves railfans, not just passengers.
- Weekly punctuality digest (scheduled post) — original content the sub would
  engage with, built from data already cached.
- Mod analytics: which trains/routes get asked most, to inform the wiki and
  megathread.
- Auto-answer + megathread redirect for repetitive travel-query posts.

**Ambitious**

- Interactive live-board post (Devvit custom post + realtime).
- Route map images (GIS geometry → rendered image → media upload).

**Deliberately not planned**

- Fare and seat availability: high API cost, users are already on IRCTC, data
  goes stale fast.
- Live notifications/subscriptions: DM-spam risk.

### Test gaps worth closing

Needs a Redis fake: `checkAndConsume`, `cached`, `claimComment`. Their pure
predicates are tested; the Redis interaction is not.

---

## 8. Design decisions to preserve

**PNR is aggregate-only.** Upstream returns `berthNo` inside
`passengers[].booking` and `passengers[].current`, plus a `formatted` string that
can embed the coach/berth. None of these are modelled in `types.ts`, so there is
no field for a renderer to read. Anyone can query any 10-digit number, so full
detail would make the bot a people-locator. A test asserts no berth value ever
appears.

**Recursion guard must stay first.** Reply footers contain literal `!command`
hints for discovery, so the bot would answer its own footers forever. The guard
fails safe: if the app username cannot be resolved, it skips rather than risks a
loop.

**Guards run cheapest-first.** Pure regex parse → settings → self-check →
idempotency claim → rate limits. Comments without commands exit with zero I/O,
which matters at 400k-visitor scale.

**Honest labelling.** When the API reports `isLive: false` or a non-`real-time`
tracking mode, the reply says the data is estimated. Presenting estimates as live
destroys trust the first time it is wrong.

**Ships disabled.** `railradarEnabled` defaults to `false` so no install starts
replying unprompted.

---

## 9. Adding a command

The dispatcher is a registry, so this is additive:

1. Add the verb and aliases to `VERB_ALIASES` in `parse.ts`, plus a `USAGE` entry.
2. Add a `build*` branch returning a typed `ParsedCommand`.
3. Create `commands/<name>.ts` — resolve input, fetch via `railRadarGetCached`,
   hand off to a renderer.
4. Create `render/<name>.ts` as a **pure** function (keeps it unit-testable).
5. Add one `case` to the switch in `commands/index.ts`.
6. Add tests for the parse branch and the renderer.

Identifier formats live only in `validate.ts` — reuse them rather than writing
new regexes, and never interpolate an unvalidated value into an API path.

---

## 10. Operational notes

**Settings** (subreddit scope): `railradarEnabled` (off),
`railradarPnrEnabled` (on), `railradarCooldownSeconds` (30),
`railradarMaxRepliesPerPost` (10), `railradarDailyLimit` (2000).

**Secret** (global): `railradarApiKey`.

**Cache TTLs:** live 90s · schedules 24h · lookups 7d · routes 6h · PNR 60s ·
predictions 30m.

**Platform limits to stay clear of:** Redis 5 GB per installation, 30s request
timeout (client aborts at 12s), scheduler max 10 recurring tasks.

**Known upstream behaviour:** Indian Railways PRS is down nightly
**23:45–00:20 IST**. The bot reports this as maintenance with a retry time
rather than as an error.

**Removing the feature:** delete `src/features/railradar/`, drop the
`railradar:on-comment-submit` entry from `src/routes/triggers.ts`, and remove the
`railradar*` settings plus `permissions.http` from `devvit.json`.
