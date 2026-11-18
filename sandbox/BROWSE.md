# browse.mjs — see and operate a web page from the shell

One headless Chrome per reviewer, driven by short commands. No install: Node 22+ and Google Chrome are
enough. Each session is its own browser with its own storage, so several reviewers can work at once.

```bash
node sandbox/browse.mjs <session> <command> [args]     # <session> = any short name you pick, e.g. r1
```

Every command prints `OK …` or `ERROR … (what to try)` on its first line and exits 0 or 1.
The app's addresses and sign-in links are in `sandbox/README.md`.

## A first session

```bash
node sandbox/browse.mjs r1 start phone http://localhost:4600/   # phone | small | desktop
node sandbox/browse.mjs r1 look
node sandbox/browse.mjs r1 click "Sign in"
node sandbox/browse.mjs r1 type "Email" "maya@example.com"
node sandbox/browse.mjs r1 press Enter
node sandbox/browse.mjs r1 shot login                           # then read the PNG it prints
node sandbox/browse.mjs r1 stop
```

## Reading the output

```
OK tapped [3] link "SIGN IN / SIGN UP" → now at /login
URL http://localhost:4600/login
TITLE WhistMate
VIEW phone 390x844 · scrolled 0/633px (more below)
OVERLAY dialog "Join a group" is open — the page behind it is blocked      (only when one is open)
ELEMENTS 6
[1] button "Continue with Google"
[2] input:email "Email" empty placeholder="you@example.com" required focused
[5] button "Log in" disabled
-- below the fold — scroll down --
[6] link "Create one" → /register
TEXT
# Welcome back                          # = heading level
Password | [3] Forgot password?         | = side by side on screen; [n] = where control n sits
(alert) Invalid email or password       text inside an alert/toast region
EVENTS since the last command
! http 400 POST /api/auth/login — {"message":"Invalid email or password"}
! dialog confirm "Delete this round?" → accepted (OK)
```

- **ELEMENTS** are the controls a user could operate, numbered in reading order (top bar, content, bottom
  bar), with their state: `disabled`, `checked/unchecked`, `on/off`, `selected`, `expanded/collapsed`,
  `value="…"`, `empty`, `placeholder`, `required`, `invalid`, `focused`. `(no label)` means the control has
  no accessible name; `icon=…` / `near="…"` say how to recognise it anyway. `clickable` is a non-button
  element that reacts to clicks.
- Controls under a sticky header or bottom bar count as above/below the fold. When an overlay blocks the
  page, only the overlay's controls are listed.
- **After an action** you get the full listing if the page changed a lot; otherwise only
  `CHANGED` lines (`~` changed, `+` new, `-` gone; everything else and all numbers are as last listed), or
  `PAGE unchanged`. `LISTING unchanged, but the page itself changed` means only styling changed (a selected
  look, a colour) — take a `shot`. Run `look` whenever you want the whole picture again.
- **EVENTS** are new console errors, uncaught exceptions, failed or 4xx/5xx requests (with the start of the
  response body), JS dialogs and blocked new tabs. They appear once, on the next command's output.

## Commands

| Command | What it does |
|---|---|
| `start [phone\|small\|desktop] [url]` | Launch this session's browser (replaces a running one). phone 390x844 touch (default), small 320x568 touch, desktop 1440x900 mouse. Fresh profile each time; `--keep` keeps cookies/storage. |
| `goto <url>` · `back` · `reload` | `goto /path` is relative to the current site. `reload` also rescues a frozen tab. |
| `look` | The listing above. `look --all` lifts the caps (long pages, long lines, text behind an overlay). |
| `click <target>` | Scrolls the target into view and taps (touch presets) or clicks (desktop) its centre with real input events, then waits for the page to settle. Refuses disabled or covered controls and says why; `--force` taps anyway. |
| `type <target> <text>` | Focuses the field, replaces its content (`--append` adds; `""` clears) and reports what the field holds afterwards. Works with React inputs, number/date fields, textareas. |
| `press <Key> [times]` | `Enter`, `Tab`, `Shift+Tab`, `Escape`, `Backspace`, `Delete`, `Space`, `ArrowDown`…, `Home`, `End`, a character. |
| `select <target> <option>` | Native `<select>` only. Custom dropdowns: `click` the trigger, then `click` the option. |
| `scroll <down\|up\|top\|bottom\|"text">` | Scrolls what a user would scroll (an open sheet, the page, or the main inner scroller). |
| `shot [name] [--full] [--1x]` | PNG in the session's `shots/`; prints the absolute path and pixel size. `--full` = whole document, `--1x` = CSS-pixel size (smaller file). Read it with your file-reading tool. |
| `viewport <phone\|small\|desktop\|WxH>` | Resize without reloading; the page and its state stay. |
| `wait <ms \| "text">` | Fixed pause (max 15 s) or until the text is visible (10 s; `--timeout ms`). |
| `dialog [accept\|dismiss] [text]` | How `confirm`/`prompt` are answered from now on (default accept; `text` answers prompts). Alerts are always closed. Every dialog is reported in EVENTS. |
| `storage` | localStorage, sessionStorage and cookies of the page. |
| `eval <js>` | Runs JavaScript in the page and prints the JSON result. Quote it: `eval "document.title"`. |
| `errors` | Everything recorded since `start` (`--clear` empties the list). |
| `stop` | Closes this session's browser. `node sandbox/browse.mjs stop-all` closes every session; `list` shows them. |

**Targets** for `click`, `type`, `select`:

- `7` — a number from the latest listing. A bare number is always a list number, never text.
- `"Save round"` — visible text: label, placeholder, icon name or the `near` text; case-insensitive, exact
  match first, then partial. If several match you get the candidates with their numbers and nothing is
  clicked. Use `text=7` to click something whose label is the digit 7.
- `css=button[type=submit]` — a CSS selector (first visible match).
- `xy=195,30` — a point in the viewport, in CSS pixels (`click` only; e.g. to tap outside a sheet).

Flags for any action: `-q` prints only the result line, `--look` prints the full listing.

## A working rhythm

1. `look` when you arrive somewhere; act by number. After each action read the first line, then the
   changes. Numbers stay valid until the listing changes; if an element is gone you are told and re-listed.
2. `shot` whenever appearance matters (layout, colours, overlap, truncation, what a selected state looks
   like) — the listing is structure and text, not looks. Check both `phone` and `small`.
3. Read EVENTS as you go and run `errors` before you finish a flow; a silent 4xx or console error is a finding.
4. Something slow or animated? `wait "text you expect"`, then carry on.
5. `stop` when done.

## Limits

- One tab. A link that opens a new tab is reported and closed; `goto` its address if you need it.
- The listing cannot see inside iframes, canvas/SVG charts (shown as `(graphic WxH)`), CSS-generated text,
  or shadow DOM. Use `shot`.
- No file uploads or downloads, no drag-and-drop, long-press, pinch or hover menus. `eval` is the escape hatch.
- Touch presets send real touch taps but the engine is desktop Chrome with an iPhone user agent: iOS-only
  quirks (safe areas, the on-screen keyboard, rubber-band scrolling) are not reproduced.
- "Settled" means: load finished, no fresh requests, DOM quiet. A request that runs longer than ~3 s, or a
  page that never stops changing, is not waited for — the result line says so.
- A command returns within about 20 s. A session left idle for 2 hours stops itself.

## Troubleshooting

| You see | Do |
|---|---|
| `ERROR session "r1" is not running` | `start` it again (state in the page is gone; use `--keep` to keep storage). |
| `ERROR … is covered by …` | Something is on top: `press Escape`, close the overlay, or `scroll`; `shot` to look. |
| `ERROR "X" matches N elements` | Use one of the numbers listed. |
| `ERROR [n] is no longer on the page` | The page changed; pick from the fresh listing that follows. |
| `ERROR … did not respond` / page frozen | `look`; if still stuck `reload`; last resort `stop` then `start`. |
| Text you expect is missing | `wait "text"`, `scroll`, or `look --all` (long pages are capped). |
| Could not load a URL | Is the server running? Check the port; try `goto` again. |
| Leftover browsers | `node sandbox/browse.mjs stop-all` |

Files live in `sandbox/.browse/<session>/` (`shots/`, `daemon.log`, the browser profile); `--dir <path>` or
`BROWSE_DIR` moves the base directory. `node sandbox/browse.mjs selftest` checks the tool itself.
