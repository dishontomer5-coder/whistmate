# WhistMate — round 1 rulings (the lead's decisions for the implementers)

Six independent reviewers went through the app. Their findings are in
`all-findings.json` (and `qa-tester/findings.json`), verified and clustered in
`triage-verified.json` — all in this folder. Screenshots are under `<reviewer>/shots/`.
This file says what to DO about them. Where a reviewer's suggested fix and a ruling here
differ, the ruling wins. Finding ids are quoted so you can read the evidence.

## Ground rules for every implementer

- Read `design.md` first (stack, invariants), then this file, then the findings for your area.
- **Must not change:** scoring results (`src/lib/scoring.js` behaviour; `src/lib/scoring.test.mjs`
  assertions untouched); existing users' data; existing links (`/join?code=…`, `/session/:id`,
  `/round/:id`, `/player/:id`, `/about`, `/history`, `/profile`, `/admin`, `/home`, `/login`,
  `/register` keep working — a renamed route keeps a redirect); the single rulebook source
  (`docs/whist-rules.md` → `npm run rules:gen`; never hand-edit `RULES_DOC` in `askRules`); the truth
  of the data statements on `/about` and in `README.md`; the product's identity (the name WhistMate,
  the navy-and-gold look, the spade mark).
- **No new npm dependencies.** Do not run `npm install`. Everything needed is already installed
  (React 18, react-router 6, Tailwind 3, the shadcn/Radix components in `src/components/ui`,
  lucide-react, recharts).
- The browser never reads data entities directly — only through backend functions
  (`base44.functions.invoke`). `scripts/functions-access.test.mjs` fails if you break that.
- Stay inside your file list. If a fix needs a file that is not yours, describe the change in your
  report instead of making it.
- Verify in the sandbox before you report (see "How to check your work").
- Write comments that describe what the code does and why. Cite the finding id only where the
  reason would otherwise be invisible (`// P13: …`).
- Commit on your worktree branch (message ends with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`). Do not push, deploy, or touch the
  live app.

## How to check your work

In your worktree: `ln -s /Users/tomerdi/Personal/whistmate/node_modules node_modules` (it is
git-ignored), then
- `npm run build`, `npm run lint`, `npm run rules:check`
- `node src/lib/scoring.test.mjs`, `node src/lib/whist-stats.test.mjs`,
  `node scripts/functions-access.test.mjs`, `node sandbox/smoke.mjs`
- Run the app: `node sandbox/server.mjs --port <your port>` (builds your worktree's frontend into
  `sandbox/.dist`, serves it with seeded demo data; `sandbox/README.md` has users and tokens — e.g.
  open `/?access_token=sbx-maya`), and drive it with `node sandbox/browse.mjs <session> …`
  (`sandbox/BROWSE.md`). Take before/after screenshots at `phone` (390x844) and `small` (320x568)
  for every screen you change, and `desktop` where layout changes. Stop your server and browser
  sessions when done.

## Words (use these everywhere; fix the strays you meet in your files)

- The app is **WhistMate** (never "WHIST" alone; the header may shorten to the spade mark + "WhistMate").
- **Group** › **Session** (one night) › **Round** (one hand). Never "game" for either
  (`Games played`, `Game 74`, `Back to Games` are strays). The stored field `game_limit` is shown as
  "Round limit".
- A player **bids** N and **takes** T tricks: "bid 4 · took 4" (not "won 4").
- A session is **won** only when it is closed. While it is open the top player is **leading**.
- **Note** (not "scouting note"); the feed of notes is **Table talk**.
- A player without an account is an **unclaimed player** (not "ghost"); a player linked to an
  account is **claimed**. Never show "soft-delete" to users: say "Delete group".
- Plain words, no symbols or internals: not "Σ=13" but "the bids can't total 13"; not
  "re-derives up/down"; not "Network Error" but "Couldn't reach the server — nothing was lost. Try again."

## Structure and navigation (owner: structure implementer)

1. **Group tabs** (returning-player-4, visual-designer-19; the owner's own observation):
   | Tab | Icon (lucide) | Route | Inside |
   |---|---|---|---|
   | Standings | `Trophy` | `/` | Resume/Start banner for the open session; standings; awards |
   | Sessions | `CalendarDays` | `/history` | Every session, newest first; "Start new session" at the top when none is open |
   | Players | `Users` | `/profile` | Opens on me; a player switcher at the top; then everything in ruling 6 |
   | Admin | `Settings` | `/admin` | Group admins only |
   Session and round pages light the **Sessions** tab; player pages light **Players**.
2. **Outer tabs**: Groups (`Users`) · Activity (`Bell`) · Me (`User`, the all-groups stats at
   `/profile/global`). "My Account" content (name, e-mail, sign out) moves to the foot of **Me**;
   `/account` keeps working. Menu: Rules & scoring (`BookOpen`) · About & privacy · Sign out.
3. **The group comes from the page, not from memory** (returning-player-1, -2). A session, round or
   player page takes its group from the data it loaded: if that differs from the active group, switch
   the active group to it (the user is a member, or the load would have failed). The header's group
   name and archived badge always describe the group of the page on screen. Going to "Groups" must
   NOT clear the remembered group, so the browser Back button returns into the group page it left.
   Do not change the URL scheme.
4. **One back control per page.** The header shows "‹ Groups" with its label at every width
   (returning-player-5, scorekeeper-8). The in-page back link goes to the previous page
   (`navigate(-1)`), with a sensible fallback when there is no history, and says where it goes when
   that is known. A player page's back no longer always goes to History (returning-player-6).
   About and Me keep you where you came from.
5. **Sessions list**: each card shows the date, name, place, rounds, the scoring method and
   "Advanced" when on, and — for a closed session — who won and the caller's own place and score
   (visual-designer-27, returning-player-7). No "CLOSED" on every card: mark only the OPEN one.
6. **Players tab / player page** (returning-player-7, -8, -9, visual-designer-17), top to bottom:
   player switcher · name and headline numbers · best night and worst night (session name, date,
   score) · stat tiles (the explanation must not cover the number; a rate with nothing to count shows
   "—", not 0% — returning-player-19) · chart · **Table talk with "Leave a note" at its head** ·
   round history grouped by session (session name and date as the group heading; "Show more" when
   longer than 20 rows, never a silent cut). `/profile` (me) and `/player/:id` are the same page.
   A note opened from Activity lands on the notes, not on the top of the page.
7. **Standings** (returning-player-16): the small figure beside a total is labelled by what it is —
   "tonight" when a session is open, otherwise the name of the last closed session — and each row
   below the leader shows the gap to the leader.
8. The "not found" page uses the app's own look (visual-designer-9).

## Stats (owner: stats implementer)

9. **A win is a closed session finished in first place** (scorekeeper-6, returning-player-3,
   whist-player-1, newcomer-6). Wins, win rate and podiums count closed sessions only — in the
   standings, the profile, the all-groups stats, front end and back end alike. Inside an open
   session nobody has "1 win".
10. **The Destroyer** (whist-player-5, returning-player-15): redefined so it names a person — "Most
    'everyone falls' rounds as the top bidder": count a cancelled round for the player recorded as
    the trump winner (`highest_bidder_player_id`), or, when none is recorded, for every player who
    bid the highest number in that round. Ties name every holder. An award nobody holds is not shown;
    a profile shows only the awards that player currently holds, plus their own figures as plain stats.
    If `docs/whist-rules.md` describes the awards, update it there and run `npm run rules:gen`.
11. **Everyone-falls rounds stay counted as rounds played** (whist-player-11): BY DESIGN — the hand
    was played and scored zero; excluding it would make "rounds" disagree with the rounds a player
    sat in. Do not change. (The tile's explanation may say so.)
12. A rate with nothing to count shows "—" (zero-bid success with no zero bids).
13. Give the Players page what ruling 6 needs: per-session totals for a player (best and worst
    night), and the session name and date for each round-history row.

## The round (owner: round-flow implementer)

14. **Round entry is a focused screen** (scorekeeper-2, visual-designer-1, -2, newcomer-15): on
    "pick the table", bidding, results and edit screens the bottom tab bar is hidden and the primary
    action (Start Round / Lock Bids / Save Round / Save) sits in a sticky bar at the bottom of the
    screen, always visible, at least 52 px tall, clear of the safe area. Number keys are at least
    44x44 px with 8 px gaps — 7 columns from 360 px wide, 5 columns below. Nothing on these screens
    needs a scroll to finish the step at 375x667. The phase title is never truncated.
15. **Every tappable thing is at least 44x44 px** (visual-designer-2, scorekeeper-11): renege, the
    trump marker, "Edit bids", "Edit round", back links, header buttons, close buttons.
16. **A started round can be discarded** (scorekeeper-1, whist-player-2): "Discard round" on the
    bidding and results screens and on the round's card in the session, with one confirmation. The
    server already allows any member to delete a round that is not yet scored (`deleteRound`).
    "Close session" is always offered; with a round in play its confirmation says that round will be
    discarded, and does both.
17. **Nothing typed is lost** (scorekeeper-3, -5, whist-player-8): bids, the trump mark, tricks and
    reneges not yet locked or saved are kept per round in the browser (`localStorage`, cleared when
    the round is locked/saved/discarded, ignored after 24 hours) and restored with a one-line note
    when the scorer comes back. "Edit bids" keeps the tricks already typed — the screen already
    promises that.
18. **Bidding order** (scorekeeper-4, whist-player-6): after a bid the cursor moves to the NEXT row
    after the one just entered (wrapping round, skipping rows already filled), so the table can start
    from any player. "Same players as last round" seats the same four with the bidding order rotated
    by one, and says who bids first.
19. **See the outcome before saving** (scorekeeper-7, whist-player-20, visual-designer-28): as tricks
    are entered each row shows made or missed and the points it will score (use `scoreRound` from
    `src/lib/scoring.js` — the same code the server mirrors); when nobody makes their contract a
    line above Save says "Nobody made their contract — everyone falls, all contract points are 0".
20. **Renege** (newcomer-4): the control says "Renege −100", is a full-size target, shows clearly
    when on, and the row's preview shows the −100. No extra confirmation (the preview makes a slip
    visible, and a second tap undoes it).
21. **Say why a button is off** (scorekeeper-9, newcomer-9, whist-player-10): whenever Lock Bids or
    Save is disabled, one line next to it says what is missing ("Pick the trump suit", "Choose the
    card order", "Tricks must total 13 — now 12").
22. **Trump and card order** (scorekeeper-10, whist-player-10, -17): the trump marker is a visible,
    labelled control; suits are offered in auction order ♣ ♦ ♥ ♠ NT, hearts and diamonds always in
    the red text colour, spades and clubs in the foreground colour, on every screen; a winner marked
    without a suit cannot be locked silently (ruling 21). The card-order choice has a heading ("Card
    order"), plain labels ("Ace high" / "Ace high, then 2 up to King"), and is shown during play and
    on the scored round. Which player may be marked is NOT restricted (whist-player-9: by design —
    the app records what the table decided).
23. **Fix a saved round directly** (scorekeeper-12): one "Edit round" opens the editor, which uses
    the same tap pad as entry, and saving returns to the session.
24. **Closing a session ends with a result** (scorekeeper-13, newcomer-19, whist-player-21): an
    in-app confirmation; afterwards the session page leads with the winner and final standings.
25. **New session** (scorekeeper-14, -15, newcomer-18): an optional "Round limit" (1–99; `startSession`
    accepts `game_limit`), shown on the session header; scoring methods described with their numbers
    ("Classic: −10 for each trick off. Progressive: −5 each for 1–4 off, −10 each for 5, −15 each for
    6, −20 each for 7 or more"); the default name is the weekday and date ("Thursday, 19 Nov") rather
    than "Whist Night"; the session header and cards show the scoring method.
26. **"How scoring works"** (newcomer-3, -7, whist-player-7, returning-player-17): one help sheet,
    opened from a "?" on the round screens, the session page and the standings: exact contract,
    misses (both methods), zero bids, up/down tables, everyone falls, renege, trump and card order.
    Build its numbers from the constants in `src/lib/scoring.js` so it cannot drift. The UP/DOWN
    badge, the "Everyone fell" badge and "Renege" open it at the right place.
27. The last round's results stay readable after saving (scorekeeper-18): the session page shows the
    round just saved directly under the primary button.

## Getting in (owner: onboarding implementer)

28. **An invitation survives sign-in and sign-up** (newcomer-1): after logging in, signing up
    (including the code step) or Google, go back to where the visitor was headed — the same-origin
    address in `from_url` — instead of always `/home`. Same for any signed-in page opened while
    signed out.
29. **The invite page welcomes a stranger** (newcomer-5, visual-designer-24): the WhistMate mark,
    "You're invited to join <group> on WhistMate" (the share link carries the group's name as a
    display-only `name` parameter; without it say "a whist group"), one line on what WhistMate is,
    "Create an account" as the main button and "I already have an account" beside it, and a link to
    About. No new unauthenticated endpoint. After signing in, the join dialog (which shows the real
    group name from the server) opens over the app, not over an empty screen.
30. **A new group's owner is led to their first round** (newcomer-2): an empty group shows a short
    checklist — add players (n of 4), invite with a link, start the first session — each with its
    button. The "fewer than 4 players" message links to adding players.
31. **After claiming a player** (newcomer-8): say "You're now <name> in <group>", and show how to
    undo it (ask a group admin) and where to leave the group.
32. Sign-up shows the password rule before it fails; password reset confirms success and a used
    link offers a fresh one (newcomer-11). My Account does not say "User" when there is no name
    (newcomer-10).

## Admin (owner: onboarding implementer)

33. **Order**: Members first (with "Add player" and the invite code/link), then Settings, then the
    danger zone last (visual-designer-23, newcomer-2).
34. **Member rows fit the screen** at 320 px and up (visual-designer-5): name and status on one
    line, actions in a "⋯" menu (rename, make admin/player, unclaim, remove).
35. **One confirmation dialog** for every destructive or hard-to-undo action
    (visual-designer-6): remove member, archive, regenerate invite code (say that the old code and
    links stop working), delete group (keeps the type-the-name step), delete round, discard round,
    close session, delete note. Use `src/components/ConfirmDialog.jsx`; no `window.confirm`, no
    in-place button swaps.
36. An archived group's admin screen is read-only with a clear banner and an "Unarchive" button —
    the server now refuses every other change with "This group is archived — it is read-only".

## Look and feel (owner: foundation implementer, then everyone uses it)

37. **Colour means one thing** (visual-designer-3, -4): a gained score is gold, zero is muted, a lost
    score is the red TEXT colour (#F87171 — the existing #E03E3E stays for fills and borders only; it
    fails contrast as text). UP/DOWN is a neutral outlined badge with ▲/▼, never red/green.
    Movement arrows keep green/red. Error text uses the red text colour.
38. **User-written text keeps its own direction** (whist-player-3, -4, visual-designer-10,
    returning-player-22): names inside app sentences are isolated (`<bdi>`), free text (notes,
    session and group names, places) is rendered and typed with `dir="auto"`.
39. **Dialogs on phones** are rounded cards with a margin, buttons not touching
    (visual-designer-8). Buttons come in three heights only: 44 (default), 52 (primary on a screen),
    36 is gone (visual-designer-14). Inputs are 44 px with a visible outline (visual-designer-13).
40. Type: nothing below 12 px carries information (visual-designer-11); one page-title style.
41. One empty-state component, one error-state component (visual-designer-21).
42. Avatars: one style everywhere, and a Hebrew initial that is a thin stroke (י) is drawn large
    enough to read (visual-designer-18).

## Rules assistant (owner: onboarding implementer)

43. The assistant answers in the language of the question (whist-player-15). Its refusal keeps the
    owner's voice but is not a dead end: "IDK bro 🤷 — that's not in the WhistMate rulebook. I only
    know the rules and scoring; for your account or your data, see About & privacy in the menu."
    (whist-player-16). The menu item is "Rules & scoring". These live in
    `base44/functions/askRules/entry.ts` (outside the generated `RULES_DOC` block) and
    `src/pages/RulesChat.jsx`.

## Deliberately not done (do not build)

- Group id in the address (ruling 3 fixes the symptoms without breaking links).
- A dealer marker / full auction tracking (whist-player-6): the app records the outcome of a hand,
  not the auction. Ruling 18 covers the order problem.
- Side-by-side player comparison, auto-filling the fourth player's tricks, a "card table" redesign,
  desktop-specific layouts beyond what breaks (ideas: returning-player-23, scorekeeper-17,
  visual-designer-25, -26). Logged as ideas.
- The store icon (visual-designer-7) is the owner's artwork and the owner's decision; nothing in the
  app changes for it.

## Added from the QA tester (findings in `qa-tester/findings.json`)

44. **Role follows the page's group** (qa-tester-3): with ruling 3, admin-only controls (Edit round,
    Delete round, the Admin tab) are shown according to the caller's role in the group of the page on
    screen, never the previously active group. A player link opened across groups resolves, it does
    not say "Player Not Found". — structure implementer.
45. **New Session takes the group's defaults whenever the group data arrives**, including after a
    reload (qa-tester-4), until the scorer has touched the control. — round-flow implementer.
46. **Feedback appears where the action was** (qa-tester-6): an error shows under the field or beside
    the button that caused it, a success says so ("Saved", "Renamed to …") — on the admin screens
    especially. Nothing fails silently (qa-tester-14, -18). — onboarding/admin implementer.
47. Deep links opened signed out return to the page asked for after sign-in (qa-tester-2; ruling 28).
48. Ruling 35 also covers the app-admin dashboard's "Make admin" / "Make user" (qa-tester-9).
49. Starting a session while one is open says so ("A session is already open — here it is") instead of
    jumping silently (qa-tester-10). — round-flow implementer.
50. **Player names are unique within a group regardless of letter case and surrounding spaces**
    (qa-tester-7), on the server (add player, join as new, rename) with the existing message. — stats/
    backend implementer.
51. **"Remove" says what it will do** (qa-tester-8): for a player with history and an account the
    action is "Detach account" (the player and their history stay, unclaimed); for a player with
    history and no account there is nothing to remove — say why; a player with no history can be
    removed. One clearly-worded action per case, each with the confirmation of ruling 35. —
    onboarding/admin implementer.
52. The session page's "Start round N" shows the number the round will really get (highest existing
    number + 1; qa-tester-11). — round-flow implementer.
53. **Archived groups are visibly read-only** (qa-tester-14): on session, round, player and admin
    pages no write action is offered (Start round, Edit round, Close session, Leave a note, member
    actions) and a banner says "This group is archived — read-only". Archiving is refused while a
    session is open, with "Close the open session first" (server: `setGroupStatus`; UI shows it). —
    server part: stats/backend implementer; pages: each page's owner.
54. **Inputs have limits** (qa-tester-13): session name and place at most 60 characters, the date
    required and between 2000 and 2100, enforced in the form and on the server (`startSession`); long
    unbroken text wraps instead of widening the page. — round-flow implementer (form), stats/backend
    implementer (server).
55. After deleting a group the admin lands on the list of groups with a notice (qa-tester-15). —
    onboarding/admin implementer.
56. `/app-admin` shows a plain "not available" page to anyone who is not an app admin, with none of
    its frame (qa-tester-16). — onboarding/admin implementer.
57. Lists refresh after an action changes them (unclaim, delete note); deleting something that is
    already gone counts as done (qa-tester-18). — owner of each screen.
58. **Tied players share a rank** in every standings list (#2, #2, #4; qa-tester-20). — stats implementer.
59. A plain player on a scored round is told "Only a group admin can change a scored round"
    (qa-tester-19). — round-flow implementer.
60. **Every icon-only button and switch has an accessible name**, and toggles expose their state
    (`aria-pressed` on Renege; qa-tester-23). — everyone, in their files.
61. **Leave group** (qa-tester-24, newcomer-8): in the Players tab, under the caller's own name:
    "Leave this group" with a confirmation (server: `removeMember` on yourself). — structure implementer.

## Added from the triage verifier (new items no reviewer reported; evidence in `triage-shots/`)

62. **An existing member who opens the invite link** is told "You're already in <group>" with an
    "Open the group" button, not a dead end (`JoinGroupDialog.jsx`). — onboarding/admin implementer.
63. **A calendar date is a calendar date** (`src/lib/format.js` `formatDate`): a date-only value such
    as `2026-11-19` is shown as that day in every time zone (parse it as a local date; do not let
    `new Date('2026-11-19')` shift it to the day before west of UTC). The New Session form always
    sends the scorer's local date. — foundation implementer (format), round-flow implementer (form).
64. **Standings show everyone** (`Home.jsx` cuts at eight): list all players, or the first ten with
    "Show all". — structure implementer.
65. Row labels with a Hebrew name keep their number in front ("1. יוסי", not "יוסי .1") — ruling 38
    applied to the bidding rows. "Edit bids" then Cancel keeps the renege marks as well as the tricks
    (ruling 17). A session tied for first place is a shared win for both leaders (with ruling 58 both
    are #1) — by design.
66. A player's own note does not raise their own "new" badge on Activity (`getActivityFeed`). —
    stats/backend implementer.
