# WhistMate sandbox

The whole app on one local port, with nothing real behind it. Anyone can be signed in, every write
lands in memory, and one request puts everything back.

- The **frontend** is the real one, built from `src/` with `VITE_BASE44_APP_ID=sandbox`.
- The **backend functions** are the real ones too: all 31 `base44/functions/*/entry.ts` files run
  unchanged, against an in-memory store instead of Base44.
- The **data** was written through those functions, so every score in it came from the app's own code.
- It never calls the live app, the Base44 platform, an AI model or a mail server.

## Start it

```bash
node sandbox/server.mjs --port 4600
```

That builds the frontend into `sandbox/.dist` (a few seconds), seeds the data and prints the sign-in
links. Then open <http://localhost:4600>.

| Flag | What it does |
|---|---|
| `--port N` | Port to listen on. Default 4600. |
| `--no-build` | Skip the frontend build and serve the existing `sandbox/.dist`. |
| `--host H` | Address to bind. Default `127.0.0.1` (this machine only). |
| `--quiet` | No banner and no request log. |
| `--page-cap N` | Most rows one entity query returns. Default 500 (see "How close is it to Base44"). |

Needs Node 22.18 or newer, because it loads the TypeScript functions directly (on 22.15 to 22.17 the
server restarts itself with `--experimental-strip-types`), and the project's existing `node_modules`.
It installs nothing.

**Several at once:** start each on its own port. They share nothing but the built files, and they all
seed the same data with the same ids, so a link from one instance works on another once the port is
changed. Starting several at the same moment is safe; the first one builds and the others wait for it.

```bash
node sandbox/server.mjs --port 4601 --no-build
node sandbox/server.mjs --port 4602 --no-build
```

## Who you can be

Every seeded user has the password **`whist123`**.

| Email | Token | Who |
|---|---|---|
| `maya@example.com` | `sbx-c40a75ce0f4babafc5db9fab` | Maya. Group admin of Thursday Whist, player in Family Table. |
| `dan@example.com` | `sbx-c7e75bb687083d10bfbdb77a` | Dan. Player in Thursday Whist, admin of the archived Old Crew. |
| `noa@example.com` | `sbx-6a9ad301443fda4b179da0a6` | Shown as נועה. Player in Thursday Whist, admin of Family Table. |
| `omer@example.com` | `sbx-eeb0f9145773ebc3a6770329` | Omer. Player in Thursday Whist and Old Crew. He played two nights as an unclaimed player, then claimed it. |
| `rachel@example.com` | `sbx-efc4aab892bbb68a26ffd3f9` | Rachel. Player in Thursday Whist (joined a month in) and Old Crew, admin of the soft-deleted Office League. |
| `newbie@example.com` | `sbx-ea98dcc8cfa3530870e95696` | Signed up, in no group. Use it to try joining. |
| `root@example.com` | `sbx-c2d59328358948afe0dc324c` | App admin (`role: 'admin'`), in no group. Sees `/app-admin`. |
| `gal.google@example.com` | `sbx-8217a160c331d921127750bf` | The account "Continue with Google" signs in as. In no group. |

Three ways to sign in:

1. **The login form** at `/login`, with the email and `whist123`.
2. **A link:** open any page with `?access_token=<token>`, for example
   `http://localhost:4600/?access_token=sbx-c40a75ce0f4babafc5db9fab`. The app stores the token and
   removes it from the address bar, as it does after a real sign-in. A token is `sbx-` plus the user's
   id. As a shortcut the server also accepts `sbx-` plus the part of the email before the `@`
   (`sbx-maya`, `sbx-root`).
3. **"Continue with Google"**, which signs in Gal Google without asking anything.

New accounts work as well: register at `/register` with any email and a password of 8 characters or
more, then type **any six digits** as the verification code. The account is a normal user, in memory.

The ids, tokens and invite codes above are the same on every start and on every day. They change only
if `seed.mjs` or `backend.mjs` changes; `/__sandbox/info` always has the current ones.

## What is in it

| Group | Status | Invite code | Members | Sessions | Rounds |
|---|---|---|---|---|---|
| **Thursday Whist** | active | `NHUA1B` | Maya (admin), Dan, נועה, Omer, Rachel, and two players without accounts: יוסי, אבי | 14 closed, 1 open | 164 |
| **Family Table** | active | `8OVA1Y` | נועה (admin), Maya, and two without accounts: אמא, סבא משה | 3 closed | 20 |
| **Old Crew** | archived | `SUTEB8` | Dan (admin), Omer, Rachel, Gidi (no account) | 2 closed | 13 |
| **Office League** | deleted (soft) | `ASWRKJ` | Rachel (admin), Tal, Shir, Ben (no accounts) | 1 closed | 4 |

Thursday Whist is the rich one:

- 14 closed sessions over about five months, on Thursdays, the last one on the most recent Thursday.
  160 scored rounds, with four to six people at the table and a different foursome most rounds.
- Ten sessions use classic scoring and five progressive. Two have advanced rules, so every round in
  them records a trump suit and a card hierarchy. About 40% of the rounds in ordinary sessions record
  a trump suit too.
- Planted on purpose: 8 zero bids (5 made, on both UP and DOWN tables, and 3 failed), 3 reneges (one
  inside an "everyone falls" round), 4 "everyone falls" rounds, and one session ("Quick eight") with
  a game limit of 8 that was reached.
- Session names and locations in English and Hebrew ("אצל מאיה", "ליל חמישי", "Dan's balcony").
- **One open session dated today**, "Midweek special": 3 scored rounds and a 4th with the bids locked
  and the hand still being played.
- 9 table-talk notes, 3 of them anonymous, 6 pinned to a session.

Family Table defaults to progressive scoring and has no open session. Old Crew is read-only. Office
League shows what a soft-deleted group looks like to its members (gone) and to the app admin (still
listed).

"Today" is the day the server was started. Dates in the past are local time, so sessions start around
20:30 on your clock.

## Useful addresses

`GET /__sandbox/info` returns everything as JSON: users with passwords and tokens, groups with invite
codes and member ids, and ready-made links. With the default seed on port 4600:

| What | Address |
|---|---|
| Home, as Maya | <http://localhost:4600/?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| The open session | <http://localhost:4600/session/001ca3e176b3422b4928e3db?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| The round in play | <http://localhost:4600/round/e43f939bbcb4286a5e420fc4?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| A scored round | <http://localhost:4600/round/579ae075098281d89c967fb0?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| An "everyone falls" round | <http://localhost:4600/round/8fdf1e9b2e9a9263badb80c8?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| A closed session | <http://localhost:4600/session/6588c94173caa4da2e6e579e?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| A player profile (Dan) | <http://localhost:4600/player/54a11a2ef4c8c7ec847c5fb4?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| An unclaimed player (יוסי) | <http://localhost:4600/player/5325856715e14881327328aa?access_token=sbx-c40a75ce0f4babafc5db9fab> |
| Invite link, signed out | <http://localhost:4600/join?code=NHUA1B> |
| Invite link, as newbie | <http://localhost:4600/join?code=NHUA1B&access_token=sbx-ea98dcc8cfa3530870e95696> |
| App admin dashboard, as root | <http://localhost:4600/app-admin?access_token=sbx-c2d59328358948afe0dc324c> |
| Simulated mailbox | <http://localhost:4600/__sandbox/outbox> |

Signing in happens per address: `localhost:4600` and `127.0.0.1:4600` keep separate sign-ins, and so
does each port.

## Reset

```bash
curl -X POST http://localhost:4600/__sandbox/reset
```

Reseeds to the identical starting state: same rows, ids, dates, tokens and invite codes. Accounts made
after the start are gone, and the seeded ones stay signed in because their tokens did not change.
Restarting the server does the same.

## Check it

```bash
node sandbox/smoke.mjs               # starts its own instance on a free port, tests it, stops it
node sandbox/smoke.mjs --port 4600   # tests the instance on that port (it is reset before and after)
node sandbox/seed.mjs                # prints what gets seeded, without starting a server
```

The smoke test works over HTTP only. It checks that the app is served, that a signed-out visitor gets
nothing, that sign-in and sign-up work, what members and outsiders can read, a full round played
through `startRound`, `submitBids` and `saveRoundResults` with the scores compared against
`src/lib/scoring.js`, joining by invite code, and the reset.

## What is simulated, and what is not supported

| Thing | In the sandbox |
|---|---|
| **Realtime** | The app's socket connects and then hears nothing. On Base44 a change to your membership (being removed, a role change) reaches other open tabs live; here it shows after a reload. |
| **The rules assistant** | No AI model. The answer is the passage of the rulebook that best matches the words of the question, or the exact "IDK bro" line when nothing matches. It shows the screen working, not how good the real answers are. |
| **Email** | Nothing is sent. `GET /__sandbox/outbox` lists what would have been: password-reset links (they work) and invitations. |
| **Sign-up code** | Any six digits. |
| **Google** | No Google screen. The button signs in `gal.google@example.com` and returns with `?access_token=…&is_new_user=false`. The second parameter is an assumption taken from the SDK's own sign-in code. |
| **Inviting an app admin** | Creates the account on the spot, with the password `whist123`, instead of emailing an invitation. |
| **Password rules** | 8 characters or more. That is the sandbox's own rule; Base44's real one was not checked. |
| **Page-view logging and analytics** | Accepted and dropped. |
| **The web manifest and icon** | Served by Base44 hosting in production. Here a minimal manifest and a local icon stand in, so no request leaves the machine. |
| **Not there at all** | Two-step sign-in, single sign-on, file upload, and every Base44 integration except `InvokeLLM`. The app uses none of them. |

## How close is it to Base44

Close where the app's own code runs, approximate where the platform does.

- **Functions** are the real files. `npm:@base44/sdk` is replaced by a small stand-in client and
  `Deno.serve` hands over each handler, the same way `scripts/functions-access.test.mjs` does it. The
  client supports what the functions use: `auth.me()`, `auth.updateMe()`, `asServiceRole.entities.*`
  (`filter`, `list`, `get`, `create`, `bulkCreate`, `update`, `delete`, `deleteMany`) and
  `asServiceRole.integrations.Core.InvokeLLM`. `get` of a missing id throws.
- **Signed out, inside a function.** `auth.me()` returns nothing and each function answers 401, which
  is how the project's own tests model it. On Base44 that SDK call throws instead, so the real status
  of a signed-out call may differ (the function's catch block would make it a 500). Either way no data
  comes back.
- **Entity access rules** come from the `rls` block of each `base44/entities/*.jsonc` file and are
  applied to the entity endpoints the browser can call. A denied list or filter returns `[]`, a denied
  `get` returns 404. Writes are checked against the same blocks, with 403 when denied; how Base44 words
  those refusals was not checked. `User` has no `rls` block in the repo, so the platform's usual rule is
  assumed: you read and update your own record, an app admin reads and updates everyone, and only an app
  admin changes a role.
- **Queries** understand `$in`, `$nin`, `$ne`, `$lt`, `$lte`, `$gt`, `$gte`, `$or`, `$and`, sorting such
  as `-created_date`, `limit` and `skip`. The default sort is newest first.
- **The 500-row page.** One query returns at most 500 rows whatever limit is asked for, which is what
  this project's code and tests assume about Base44. `--page-cap 5000` shows the app without that limit.
- **Records** get a 24-character hex id, `created_date`, `updated_date` and `created_by_id`, and the
  defaults from the entity file. Required fields, enums and `unique` are enforced; other types are not.
  `created_by_id` is the user a function ran for, on the assumption that Base44 records it that way (the
  SDK sends that user along with every service-role call). It matters for `Group`, whose update and
  delete rules compare `created_by_id` with the caller.
- **`session.game_limit`** is set on one seeded session directly in the store, because no function and
  no screen sets it. User accounts are also created directly. Everything else in the seed went through
  the functions.

## Files

| File | What it is |
|---|---|
| `server.mjs` | The HTTP server: static files, the `/api` routes, the socket, `/__sandbox/*`. |
| `backend.mjs` | The in-memory store, the stand-in SDK client, the access rules, the simulated assistant, and the loader for the real functions. |
| `seed.mjs` | The seeded users and the calendar of events played through the functions. |
| `smoke.mjs` | The HTTP smoke test. |
| `.dist/` | The built frontend. Ignored by git, safe to delete. |
