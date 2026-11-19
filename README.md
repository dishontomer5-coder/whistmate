# WhistMate

A scorekeeper and stats tracker for Israeli Whist. Enter the bids and the tricks won, and WhistMate does the scoring and keeps standings, history and per-player stats for your group. It does not deal or play cards.

- **Open the app:** <https://whist-mate-pro.base44.app> (a web app, made for phones; it also works in a computer browser)
- **Made by:** Tomer Dishon
- **Contact and support:** <dishontomer5@gmail.com>

## Using it

1. Open the address above and create a free account, by email or with Google.
2. Create a group, or join one with an invite code or link.
3. Start a session, pick the four players, enter the bids, then the tricks. The scores are worked out for you.

On a phone you can add WhistMate to your home screen from the browser's share menu.

## Your data

The app's own About page says the same; keep the two in step when either changes.

- **Your account:** your email address, and your name if you sign in with Google. Sign-in is handled by Base44, the platform that hosts WhistMate.
- **What your group records:** group and player names (including players someone added without an account), session names, dates and locations, bids, tricks, scores and table-talk notes. They are stored on Base44's servers. Only members of that group, and the developer as app administrator, can see them.
- **Rules assistant:** the question you ask, with the recent conversation, is sent to an AI model through Base44 to write the answer. WhistMate does not save the conversation.
- **Hosting analytics:** Base44 logs page views and basic usage, and may set a referral cookie for 30 days if you arrive from another site. There are no ads and no third-party trackers.
- **On your device:** your sign-in and your last-opened group are kept in your browser's storage. So are the bids and tricks you have typed for a round but not yet locked or saved, so they survive a reload; they are removed once the round is saved or discarded on this device, and are ignored after 24 hours in any case.
- **Permissions:** none. WhistMate does not ask for your camera, microphone, location, contacts or notifications.

To have your account or your data deleted, write to the contact address above.

## Development

This is a Base44 app: a React + Vite frontend in `src/`, with entities and backend functions in `base44/`. The repository is two-way synced with the Base44 Builder, so any change pushed here is reflected there, and changes made in the Builder arrive here as commits.

`design.md`, `plan.md` and `todo.md` hold the project's constants, decisions and live task list. Read them before changing anything.

### Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.

See the [Base44 CLI docs](https://docs.base44.com/developers/references/cli/get-started/overview) if you want to run Base44 commands directly.

### Run locally

Run the full local development environment from the project root:

```bash
base44 dev
```

`base44 dev` starts the local Base44 development backend and, because `base44/config.jsonc` sets `site.serveCommand`, the frontend dev server too. Use the frontend URL printed by the command.

### Run only the frontend

To work on the frontend against the hosted backend, create `.env.local` in the project root:

```bash
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

`VITE_BASE44_APP_ID` identifies the Base44 app. `VITE_BASE44_APP_BASE_URL` tells the Base44 Vite plugin where to send local `/api` requests. Then run:

```bash
npm run dev
```

### Checks

```bash
npm run build
npm run lint
npm run rules:check
node src/lib/scoring.test.mjs
node src/lib/whist-stats.test.mjs
node scripts/functions-access.test.mjs
```

The last one runs the backend read functions against an in-memory stand-in for Base44 and checks who can read what.

### Publish

Pushing to `main` syncs the site and the entities. Backend functions are not deployed by the sync: after any change under `base44/functions/`, deploy them with the CLI.

```bash
base44 deploy
```

### Docs and support for the platform

- [Using GitHub with Base44](https://docs.base44.com/Integrations/Using-GitHub)
- [Base44 CLI command reference](https://docs.base44.com/developers/references/cli/commands/introduction)
- [Base44 support](https://app.base44.com/support)
