#!/usr/bin/env node
// browse.mjs — a tiny, dependency-free browser driver for AI agents (a mini Playwright for the shell).
// One headless Chrome per session, driven over the DevTools protocol by a small background daemon;
// every command is a short CLI call that talks to that session's daemon. Guide: sandbox/BROWSE.md
//
//   node sandbox/browse.mjs <session> <command> [args]     e.g.  node sandbox/browse.mjs r1 start phone http://localhost:5173
//   node sandbox/browse.mjs stop-all | list | selftest | help
//
// Needs Node >= 22 (built-in WebSocket/fetch) and Google Chrome. No npm packages.
import { spawn, execFile, execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_BASE = path.join(path.dirname(SELF), '.browse');
const CHROME_PATHS = [
  process.env.BROWSE_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const PRESETS = {
  phone: { w: 390, h: 844, dpr: 2, mobile: true, touch: true },
  small: { w: 320, h: 568, dpr: 2, mobile: true, touch: true },
  desktop: { w: 1440, h: 900, dpr: 1, mobile: false, touch: false },
};
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const COMMANDS = ['start', 'goto', 'back', 'reload', 'look', 'click', 'type', 'press', 'select', 'scroll', 'shot', 'viewport', 'wait', 'dialog', 'storage', 'eval', 'errors', 'stop'];
const CMD_DEADLINE = 20000; // a command never takes longer than this
const IDLE_MS = (Number(process.env.BROWSE_IDLE_MIN) || 120) * 60000; // a forgotten session stops itself
const CLI = 'node sandbox/browse.mjs';
const QUIET_TYPES = new Set(['WebSocket', 'EventSource', 'Media', 'Ping']); // never wait for these
const LONG_POLL = /socket\.io|sockjs|transport=polling|long-?poll|\/(poll|polling|hub|stream|events|sse)(\/|\?|$)/i;

const USAGE = `browse.mjs — drive a headless Chrome step by step from the shell (guide: sandbox/BROWSE.md)
  ${CLI} <session> <command> [args]
    start [phone|small|desktop] [url] [--keep]   launch this session's browser (phone 390x844 is the default)
    goto <url> | back | reload
    look [--all]                                 what is on screen: numbered controls, text, overlays, new errors
    click <n | "text" | css=SEL | xy=X,Y> [--force]
    type <n | "label" | css=SEL> <text> [--append]
    press <Key> [times]                          Enter Tab Escape Backspace ArrowDown … or Shift+Tab
    select <n | "label" | css=SEL> <option text>
    scroll <down|up|top|bottom|"text">
    shot [name] [--full] [--1x]                  PNG under the session dir; prints the path
    viewport <phone|small|desktop|WxH>
    wait <ms | "text"> [--timeout ms]
    dialog [accept|dismiss] [prompt text]        policy for alert/confirm/prompt (default accept)
    storage | eval <js> | errors [--clear]
    stop
  ${CLI} stop-all | list | selftest
  flags: -q (no listing after an action)  --look (full listing after an action)  --all (no truncation)  --dir <base dir, default sandbox/.browse>`;

// ───────────────────────────── small utilities ─────────────────────────────
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sessionFile = (sdir) => path.join(sdir, 'session.json');

function parseArgs(argv) {
  const pos = [], flags = {};
  const BOOL = { '--all': 'all', '-q': 'quiet', '--quiet': 'quiet', '--full': 'full', '--1x': 'x1', '--append': 'append', '--keep': 'keep', '--force': 'force', '--clear': 'clear', '--look': 'look', '--help': 'help', '-h': 'help' };
  const VAL = { '--dir': 'dir', '--timeout': 'timeout' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (BOOL[a]) { flags[BOOL[a]] = true; continue; }
    const eq = a.indexOf('=');
    if (eq > 0 && VAL[a.slice(0, eq)]) { flags[VAL[a.slice(0, eq)]] = a.slice(eq + 1); continue; }
    if (VAL[a] && i + 1 < argv.length) { flags[VAL[a]] = argv[++i]; continue; }
    pos.push(a);
  }
  return { pos, flags };
}

function psList() {
  try {
    const out = execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return out.split('\n').map((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return m ? { pid: +m[1], cmd: m[2] } : null; }).filter(Boolean);
  } catch { return []; }
}
// Every process that belongs to a session dir: its daemon, its Chrome and Chrome's helpers.
function sessionProcs(sdir) {
  const prof = `--user-data-dir=${path.join(sdir, 'profile')}`;
  return psList().filter((p) => p.pid !== process.pid && (p.cmd.includes(prof + ' ') || p.cmd.endsWith(prof) || (p.cmd.includes(' __daemon ') && p.cmd.includes(` ${sdir} `))));
}
const kill = (pid, sig = 'SIGKILL') => { try { process.kill(pid, sig); } catch {} };

async function rpc(info, cmd, args, flags, timeout = CMD_DEADLINE + 6000) {
  const res = await fetch(`http://127.0.0.1:${info.port}/`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-browse-token': info.token },
    body: JSON.stringify({ cmd, args, flags }), signal: AbortSignal.timeout(timeout),
  });
  return res.json();
}

// Stop one session for good: ask nicely, then kill the daemon's process group and anything left.
async function killSession(sdir) {
  const info = readJson(sessionFile(sdir));
  let was = false;
  if (info && alive(info.pid)) {
    was = true;
    try { await rpc(info, 'stop', [], {}, 2500); } catch {}
    for (let i = 0; i < 60 && alive(info.pid); i++) await sleep(50);
  }
  // the daemon leads its own process group and Chrome lives in it: one signal takes the whole family
  if (info && sessionProcs(sdir).length) { was = true; try { process.kill(-info.pid, 'SIGKILL'); } catch {} }
  for (let round = 0; round < 40; round++) {
    const left = sessionProcs(sdir);
    if (!left.length) break;
    was = true;
    for (const p of left) kill(p.pid);
    await sleep(75);
  }
  try { fs.rmSync(sessionFile(sdir), { force: true }); } catch {}
  return { was, left: sessionProcs(sdir).length };
}

function finish(text, code) {
  process.exitCode = code;
  process.stdout.write(text.endsWith('\n') ? text : text + '\n', () => process.exit(code));
}

// ───────────────────────────── CLI ─────────────────────────────
async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const first = pos[0];
  if (first === '__daemon') return daemonMain(pos[1], pos[2], pos[3]);
  const base = path.resolve(flags.dir || process.env.BROWSE_DIR || DEFAULT_BASE);
  if (!first || first === 'help' || flags.help) return finish(USAGE, 0);
  const everywhere = !flags.dir && !process.env.BROWSE_DIR; // without --dir, stop-all/list also cover sessions started with another --dir
  if (first === 'selftest') return selftest(base);
  if (first === 'stop-all') return stopAll(base, everywhere);
  if (first === 'list') return listSessions(base, everywhere);
  if (COMMANDS.includes(first)) return finish(`ERROR the session name is missing — usage: ${CLI} <session> ${first} …  (any short name, e.g. r1)`, 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$/.test(first)) return finish(`ERROR "${first}" is not a valid session name — use letters, digits, - _ . (e.g. r1)`, 1);
  const session = first, cmd = pos[1], args = pos.slice(2), sdir = path.join(base, session);
  if (!cmd) return finish(`ERROR no command — try: ${CLI} ${session} start phone <url>   (all commands: ${CLI} help)`, 1);
  if (!COMMANDS.includes(cmd)) return finish(`ERROR unknown command "${cmd}" — commands: ${COMMANDS.join(' ')}`, 1);
  if (cmd === 'start') return cmdStart(session, sdir, args, flags);
  if (cmd === 'stop') {
    const r = await killSession(sdir);
    if (r.left) return finish(`ERROR ${r.left} process(es) of session "${session}" survived — run: ${CLI} stop-all`, 1);
    return finish(r.was ? `OK stopped "${session}" — browser and daemon are gone` : `OK "${session}" was not running`, 0);
  }
  const info = readJson(sessionFile(sdir));
  if (!info || !alive(info.pid)) return finish(`ERROR session "${session}" is not running — start it: ${CLI} ${session} start [phone|small|desktop] [url]`, 1);
  try {
    const r = await rpc(info, cmd, args, flags);
    return finish(r.out, r.ok ? 0 : 1);
  } catch (e) {
    return finish(`ERROR could not reach the "${session}" browser (${oneLine(e.cause?.code || e.name || e.message)}) — restart it: ${CLI} ${session} start`, 1);
  }
}

async function cmdStart(session, sdir, args, flags) {
  let preset = 'phone', url = null;
  for (const a of args) { if (PRESETS[a]) preset = a; else url = a; }
  await killSession(sdir); // idempotent: a stale or running session is replaced
  fs.mkdirSync(sdir, { recursive: true });
  if (!flags.keep) { try { fs.rmSync(path.join(sdir, 'profile'), { recursive: true, force: true }); } catch {} }
  const logFile = path.join(sdir, 'daemon.log');
  const fd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [SELF, '__daemon', session, sdir, preset], { detached: true, stdio: ['ignore', fd, fd] });
  let exited = null;
  child.on('exit', (c) => { exited = c ?? -1; });
  child.unref();
  fs.closeSync(fd);
  let info = null;
  for (const t0 = Date.now(); Date.now() - t0 < 20000 && exited === null;) {
    info = readJson(sessionFile(sdir));
    if (info && info.pid === child.pid) break;
    info = null;
    await sleep(60);
  }
  if (!info) {
    await killSession(sdir);
    let tail = ''; try { tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-3).join(' | '); } catch {}
    return finish(`ERROR could not start the browser for "${session}" — ${cut(oneLine(tail) || 'no details', 400)}. Check that Google Chrome is installed (or set BROWSE_CHROME) and retry.`, 1);
  }
  const p = PRESETS[preset];
  let out = `OK started "${session}" — ${preset} ${p.w}x${p.h} @${p.dpr}x${p.touch ? ' touch' : ' mouse'}, ${flags.keep ? 'profile kept (cookies and storage from before)' : 'fresh profile'}, files in ${sdir}`;
  let code = 0;
  if (url) {
    try { const r = await rpc(info, 'goto', [url], flags); out += '\n' + r.out; code = r.ok ? 0 : 1; }
    catch (e) { out += `\nERROR the browser started but goto failed (${oneLine(e.message)}) — try: ${CLI} ${session} goto ${url}`; code = 1; }
  }
  return finish(out, code);
}

function knownSessionDirs(base, everywhere) {
  const dirs = new Set();
  try { for (const d of fs.readdirSync(base, { withFileTypes: true })) if (d.isDirectory()) dirs.add(path.join(base, d.name)); } catch {}
  // daemons whose session files were deleted, or (everywhere) that were started with another --dir, are found through the process list
  for (const p of psList()) {
    const m = p.cmd.includes(SELF) && / __daemon \S+ (.+) (?:phone|small|desktop)\s*$/.exec(p.cmd);
    if (m && (everywhere || path.dirname(m[1]) === base)) dirs.add(m[1]);
  }
  return [...dirs];
}

async function stopAll(base, everywhere) {
  const stopped = [];
  let left = 0;
  await Promise.all(knownSessionDirs(base, everywhere).map(async (sdir) => {
    const r = await killSession(sdir);
    if (r.was) stopped.push(path.basename(sdir));
    left += r.left;
  }));
  if (left) return finish(`ERROR ${left} browser process(es) survived — check: ps ax | grep user-data-dir`, 1);
  return finish(`OK stopped ${stopped.length} session(s)${stopped.length ? ': ' + stopped.sort().join(', ') : ''} — no browser or daemon processes left`, 0);
}

async function listSessions(base, everywhere) {
  const rows = [];
  for (const sdir of knownSessionDirs(base, everywhere)) {
    const info = readJson(sessionFile(sdir));
    if (!info || !alive(info.pid)) continue;
    let where = '';
    try { where = (await rpc(info, 'ping', [], {}, 2000)).out.replace(/^OK /, ''); } catch { where = '(not answering)'; }
    rows.push(`${info.session}  ${where}`);
  }
  return finish([`OK ${rows.length} session(s) running`, ...rows.sort()].join('\n'), 0);
}

// ───────────────────────────── DevTools protocol client ─────────────────────────────
class CDP {
  constructor() { this.id = 0; this.pending = new Map(); this.onevent = null; this.onclose = null; this.closed = false; }
  async connect(url) {
    this.ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timed out connecting to Chrome')), 10000);
      this.ws.onopen = () => { clearTimeout(t); res(); };
      this.ws.onerror = () => { clearTimeout(t); rej(new Error('could not connect to Chrome')); };
    });
    this.ws.onerror = () => {};
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.reject(new Error(m.error.message || 'protocol error')); else p.resolve(m.result);
      } else if (m.method && this.onevent) {
        try { this.onevent(m); } catch (e) { console.log('event handler error: ' + (e.stack || e)); }
      }
    };
    this.ws.onclose = () => {
      this.closed = true;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('the browser connection closed')); }
      this.pending.clear();
      if (this.onclose) this.onclose();
    };
  }
  send(method, params = {}, sessionId, timeout = 8000) {
    if (this.closed) return Promise.reject(new Error('the browser connection closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} got no answer within ${timeout} ms`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { this.pending.delete(id); clearTimeout(timer); reject(e); }
    });
  }
}

// ───────────────────────────── in-page helper ─────────────────────────────
// Runs inside the page (main world, so React's props are visible). Everything it returns is plain JSON.
function pageHelper() {
  const VERSION = 1;
  if (window.__browse && window.__browse.v === VERSION) return true;
  const B = { v: VERSION, id: Math.random().toString(36).slice(2), gen: -1, els: [], tgts: [], cur: null, tgt: null, cand: [], click: -1, down: -1 };
  try { Object.defineProperty(window, '__browse', { value: B, configurable: true, writable: true, enumerable: false }); } catch (e) { window.__browse = B; }
  const pnow = () => performance.now();
  B.mut = B.sty = pnow(); B.mutN = 0;
  try {
    new MutationObserver((recs) => {
      let real = false;
      for (let i = 0; i < recs.length; i++) { const m = recs[i]; if (m.type !== 'attributes' || m.attributeName !== 'style') { real = true; break; } }
      if (real) { B.mut = pnow(); B.mutN++; } else B.sty = pnow();
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch (e) {}
  window.addEventListener('click', () => { B.click = pnow(); }, true);
  window.addEventListener('pointerdown', () => { B.down = pnow(); }, true);

  const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const lc = (s) => norm(s).toLowerCase();
  const tagOf = (el) => (el.tagName || '').toUpperCase();
  const isect = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const rc = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const frames = (n) => new Promise((res) => {
    let done = false, k = n || 2;
    const fin = () => { if (!done) { done = true; res(); } };
    const step = () => { if (--k <= 0) fin(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(fin, 60 * (n || 2));
  });
  const textOf = (el) => { let s; try { s = el.innerText; } catch (e) {} if (s == null) s = el.textContent; return norm(s); };
  const shown = (el) => {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    try { return getComputedStyle(el).visibility === 'visible'; } catch (e) { return false; }
  };
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1, OPTION: 1, OPTGROUP: 1, DATALIST: 1 };
  const LEAF = { INPUT: 1, TEXTAREA: 1, SELECT: 1, IMG: 1, SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, PROGRESS: 1, METER: 1 };
  const ROLES = { button: 1, link: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, option: 1, switch: 1, checkbox: 1, radio: 1, combobox: 1, slider: 1, textbox: 1, searchbox: 1, spinbutton: 1, treeitem: 1 };
  const TEXT_TYPES = { text: 1, email: 1, password: 1, search: 1, tel: 1, url: 1, number: 1 };
  const SET_TYPES = { date: 1, time: 1, 'datetime-local': 1, month: 1, week: 1, color: 1, range: 1 };

  const kindOf = (el, tag, role) => {
    tag = tag || tagOf(el);
    role = (role == null ? el.getAttribute('role') || '' : role).trim().toLowerCase();
    if (tag === 'INPUT') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'hidden') return null;
      if (t === 'checkbox') return role === 'switch' ? 'switch' : 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'range') return 'slider';
      if (t === 'file') return 'file';
      return t === 'text' ? 'input' : 'input:' + t;
    }
    if (tag === 'TEXTAREA') return 'textarea';
    if (tag === 'SELECT') return 'select';
    if (ROLES[role]) return role;
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A' && el.hasAttribute('href')) return 'link';
    if (tag === 'SUMMARY') return 'summary';
    const ce = el.getAttribute('contenteditable');
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return 'textbox';
    if (el.hasAttribute('onclick')) return 'clickable';
    return null;
  };
  const reactClick = (el) => {
    let keys; try { keys = Object.keys(el); } catch (e) { return false; }
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactProps$') === 0) { const p = el[keys[i]]; if (p && typeof p.onClick === 'function') return true; }
    }
    return false;
  };
  const isField = (el) => { const t = tagOf(el); return t === 'TEXTAREA' || t === 'SELECT' || (t === 'INPUT' && !/^(submit|button|reset|image)$/i.test(el.type)); };
  const typeable = (el) => {
    const t = tagOf(el);
    if (t === 'TEXTAREA') return true;
    if (t === 'INPUT') { const ty = (el.getAttribute('type') || 'text').toLowerCase(); return !!(TEXT_TYPES[ty] || SET_TYPES[ty]) || !/^(checkbox|radio|file|submit|button|reset|image|hidden)$/.test(ty); }
    return !!el.isContentEditable;
  };
  const isDisabled = (el) => {
    try { if (el.disabled === true || el.matches(':disabled')) return true; } catch (e) {}
    return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled');
  };
  const rendered = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width >= 4 && r.height >= 4 && s.visibility === 'visible' && +s.opacity > 0;
  };
  // The name a user would know the control by. hint = what to show when it has none.
  const labelInfo = (el, kind, tgt) => {
    let s = norm(el.getAttribute('aria-label')), hint = '';
    if (!s) {
      const ids = el.getAttribute('aria-labelledby');
      if (ids) s = norm(ids.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? textOf(n) : ''; }).join(' '));
    }
    const field = isField(el);
    const viaLabel = field || /^(checkbox|switch|radio|combobox|slider)$/.test(kind);
    if (!s && viaLabel && el.labels && el.labels.length) s = norm(Array.from(el.labels).map(textOf).join(' '));
    if (!s && !field) s = textOf(tgt || el);
    if (!s && tagOf(el) === 'INPUT' && !field) s = norm(el.value);
    if (!s) s = norm(el.getAttribute('title'));
    if (!s && !field) {
      const im = el.querySelector('img[alt]'); if (im) s = norm(im.getAttribute('alt'));
      if (!s) { const t = el.querySelector('svg title'); if (t) s = norm(t.textContent); }
      if (!s) {
        const sv = tagOf(el) === 'SVG' ? el : el.querySelector('svg');
        const m = sv && /lucide-([a-z0-9-]+)/.exec(sv.getAttribute('class') || '');
        hint = m ? 'icon=' + m[1] : sv ? 'icon-only' : '';
      }
    }
    let near = '';
    if (!s && (field || viaLabel)) { // unlabelled control: say what text sits just before it, so it can still be told apart
      const nm = el.getAttribute('name');
      for (let p = el, d = 0; p && p !== document.body && d < 4 && !near; p = p.parentElement, d++) {
        for (let sib = p.previousElementSibling; sib && !near; sib = sib.previousElementSibling) near = textOf(sib);
      }
      hint = [nm ? 'name=' + nm : '', near ? 'near="' + cut(near, 40) + '"' : ''].filter(Boolean).join(' ');
    }
    return { label: s, hint, near };
  };
  const stateOf = (el, kind, hint) => {
    const st = [], tag = tagOf(el), q = (v) => '"' + cut(norm(v), 60) + '"';
    if (hint) st.push(hint);
    if (tag === 'A') {
      const h = el.getAttribute('href');
      if (h && h !== '#' && !/^javascript:/i.test(h)) {
        let show = h;
        try { const u = new URL(h, location.href); show = u.origin === location.origin ? u.pathname + u.search + u.hash : u.href; } catch (e) {}
        st.push('→ ' + cut(show, 70));
        if (el.target === '_blank') st.push('(new tab)');
      }
    }
    if (tag === 'SELECT') {
      const o = el.selectedOptions && el.selectedOptions[0];
      st.push('= ' + q(o ? o.textContent : ''));
      const all = Array.from(el.options).map((x) => norm(x.textContent));
      st.push('options: ' + cut(all.join(' | '), 120));
    } else if (tag === 'TEXTAREA' || (tag === 'INPUT' && typeable(el))) {
      const v = el.value || '';
      if (el.type === 'password') st.push(v ? 'value=' + '•'.repeat(Math.min(v.length, 8)) + ' (' + v.length + ' chars)' : 'empty');
      else st.push(v ? 'value=' + q(v) : 'empty');
      const ph = el.getAttribute('placeholder'); if (ph) st.push('placeholder=' + q(ph));
    } else if (kind === 'slider') {
      st.push('value=' + (el.value != null && tag === 'INPUT' ? el.value : el.getAttribute('aria-valuenow')));
    } else if (kind === 'combobox' && el.labels && el.labels.length) {
      const v = textOf(el); if (v) st.push('= ' + q(v));
    } else if (kind === 'textbox') {
      const v = textOf(el); st.push(v ? 'value=' + q(v) : 'empty');
    }
    if (/^(checkbox|radio|switch|menuitemcheckbox|menuitemradio)$/.test(kind)) {
      const ac = el.getAttribute('aria-checked'), ds = el.getAttribute('data-state');
      const on = tag === 'INPUT' ? el.checked : ac ? ac === 'true' : ds === 'checked' || ds === 'on';
      st.push(ac === 'mixed' ? 'mixed' : on ? (kind === 'switch' ? 'on' : 'checked') : (kind === 'switch' ? 'off' : 'unchecked'));
    }
    const sel = el.getAttribute('aria-selected');
    if (sel === 'true' || (kind === 'tab' && el.getAttribute('data-state') === 'active')) st.push('selected');
    const ex = el.getAttribute('aria-expanded'); if (ex === 'true') st.push('expanded'); else if (ex === 'false') st.push('collapsed');
    if (el.getAttribute('aria-pressed') === 'true') st.push('pressed');
    const cur = el.getAttribute('aria-current'); if (cur && cur !== 'false') st.push('current');
    if (el.required || el.getAttribute('aria-required') === 'true') st.push('required');
    if (el.readOnly === true && typeable(el)) st.push('readonly');
    if (el.getAttribute('aria-invalid') === 'true') st.push('invalid');
    if (isDisabled(el)) st.push('disabled');
    return st.join(' ');
  };
  const brief = (el) => {
    if (!el) return 'nothing';
    const k = kindOf(el);
    if (k) return k + ' "' + cut(labelInfo(el, k, el).label, 50) + '"';
    const cls = norm(el.getAttribute('class')).split(' ').filter(Boolean).slice(0, 3).join('.');
    const t = cut(textOf(el), 40);
    return '<' + tagOf(el).toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + '>' + (t ? ' "' + t + '"' : '');
  };
  const hitOK = (h, el, tgt) => {
    if (!h) return false;
    if (h === tgt || tgt.contains(h) || h === el || el.contains(h)) return true;
    const lab = h.closest ? h.closest('label') : null;
    return !!(lab && lab.control === el);
  };

  // Open dialogs, sheets, drawers, menus, listboxes and popovers (Radix/shadcn/vaul and native <dialog>).
  const findOverlays = () => {
    let nodes;
    try { nodes = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper],[vaul-drawer],[data-vaul-drawer]')); } catch (e) { return []; }
    const floating = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p).position; if (s === 'fixed' || s === 'absolute') return true; } return false; };
    const out = [];
    for (const el of nodes) {
      if (nodes.some((o) => o !== el && o.contains(el))) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible' || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.getAttribute('data-state') === 'closed') continue;
      const inner = el.getAttribute('role') ? el : el.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]') || el;
      const role = inner.getAttribute('role') || '';
      if ((role === 'menu' || role === 'listbox') && !floating(el)) continue;
      let kind = tagOf(el) === 'DIALOG' ? 'dialog' : role || 'popover';
      if (el.matches('[vaul-drawer],[data-vaul-drawer]')) kind = 'drawer';
      let label = norm(inner.getAttribute('aria-label'));
      if (!label) { const ids = inner.getAttribute('aria-labelledby'); if (ids) label = norm(ids.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? textOf(n) : ''; }).join(' ')); }
      if (!label) { const h = el.querySelector('h1,h2,h3,h4,[role="heading"]'); if (h) label = textOf(h); }
      let modal = inner.getAttribute('aria-modal') === 'true';
      try { if (tagOf(el) === 'DIALOG' && el.matches(':modal')) modal = true; } catch (e) {}
      out.push({ el, kind, label: cut(label, 60), modal });
    }
    return out;
  };

  // What the user would scroll: inside the top overlay if one is open, else the document, else the biggest inner scroller.
  const pickScroller = (ovs) => {
    const vw = innerWidth, vh = innerHeight;
    const scrollable = (el) => {
      if (el.scrollHeight <= el.clientHeight + 2) return 0;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') return 0;
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    };
    const best = (list) => { let b = null, ba = 0; for (let i = 0; i < list.length && i < 8000; i++) { const a = scrollable(list[i]); if (a > ba) { b = list[i]; ba = a; } } return b; };
    const info = (el) => ({ el, y: Math.round(el.scrollTop), max: Math.max(0, Math.round(el.scrollHeight - el.clientHeight)), h: el.clientHeight });
    if (ovs && ovs.length) {
      const top = ovs[ovs.length - 1].el;
      const b = best([top].concat(Array.from(top.querySelectorAll('*'))));
      if (b) return info(b);
    }
    const de = document.scrollingElement || document.documentElement;
    const ho = getComputedStyle(document.documentElement).overflowY, bo = document.body ? getComputedStyle(document.body).overflowY : 'visible';
    const locked = ho === 'hidden' || ho === 'clip' || (ho === 'visible' && (bo === 'hidden' || bo === 'clip'));
    if (!locked && de.scrollHeight > vh + 2) return { el: null, y: Math.round(window.scrollY), max: Math.max(0, Math.round(de.scrollHeight - vh)), h: vh };
    const b = document.body ? best(Array.from(document.body.querySelectorAll('*'))) : null;
    return b ? info(b) : null;
  };

  // One walk over the rendered DOM: collects interactive elements and readable text together.
  const scan = (all) => {
    const vw = innerWidth, vh = innerHeight, VP = { l: 0, t: 0, r: vw, b: vh };
    const body = document.body;
    const res = { items: [], segs: [], overlays: [], modal: false, blocked: 0, hiddenText: 0, scroll: null, blockedItems: [] };
    if (!body) return res;
    const rtl = getComputedStyle(body).direction === 'rtl';
    const ovs = findOverlays();
    const ovIdx = new Map(); ovs.forEach((o, i) => ovIdx.set(o.el, i));
    const range = document.createRange();
    const raw = [], segs = [], proxied = new Set();
    let run = null, count = 0;

    // where is a box relative to what is visible? null = clipped away for good
    const place = (R, hc, sc) => {
      const v = hc ? isect(R, hc) : R;
      if (v.r - v.l < 1 || v.b - v.t < 1) return null;
      let sb = sc ? isect(sc, VP) : VP;
      const sbEmpty = sb.r - sb.l < 1 || sb.b - sb.t < 1;
      if (sbEmpty) sb = VP;
      const I = isect(v, sb), iw = I.r - I.l, ih = I.b - I.t;
      if (!sbEmpty && iw >= Math.min(v.r - v.l, 12) && ih >= Math.min(v.b - v.t, 12)) return { grp: 'view', I };
      if (v.t >= sb.b - 12 || sbEmpty) return { grp: v.b <= 12 ? 'above' : 'below' };
      if (v.b <= sb.t + 12) return { grp: 'above' };
      return { grp: 'side' };
    };
    const addText = (s, r, c) => {
      let pre = '';
      for (let m = c.mark; m && !m.used; m = m.up) { m.used = true; pre = m.s + pre; }
      if (!run) run = { parts: [], l: 1e9, t: 1e9, r: -1e9, b: -1e9, h: c.h, ov: c.ov, alert: c.alert, hc: c.hc, sc: c.sc };
      if (!run.parts.length) run.fx = c.fx;
      run.parts.push(pre + s);
      if (r) { if (r.left < run.l) run.l = r.left; if (r.top < run.t) run.t = r.top; if (r.right > run.r) run.r = r.right; if (r.bottom > run.b) run.b = r.bottom; }
    };
    const flush = () => {
      if (!run) return;
      const u = run; run = null;
      const text = norm(u.parts.join(''));
      if (!text || u.r < u.l) return;
      const R = { l: u.l, t: u.t, r: u.r, b: u.b };
      const p = place(R, u.hc, u.sc);
      if (p) segs.push({ text, R, grp: p.grp, I: p.I, fx: u.fx, h: u.h, ov: u.ov, alert: u.alert });
    };
    const textNode = (n, c) => {
      const v = n.nodeValue;
      if (!v) return;
      if (!/\S/.test(v)) { if (run) run.parts.push(' '); return; }
      if (!c.vis) return;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      let s = v;
      if (c.tt === 'uppercase') s = s.toUpperCase(); else if (c.tt === 'lowercase') s = s.toLowerCase();
      else if (c.tt === 'capitalize') s = s.replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
      addText(s, r, c);
    };
    const childBox = (el) => {
      let b = null;
      for (const ch of el.children) { const q = ch.getBoundingClientRect(); if (q.width > 0 && q.height > 0) b = b ? { l: Math.min(b.l, q.left), t: Math.min(b.t, q.top), r: Math.max(b.r, q.right), b: Math.max(b.b, q.bottom) } : rc(q); }
      return b;
    };
    const visit = (el, c) => {
      if (++count > 25000) return;
      const tag = tagOf(el);
      if (SKIP[tag]) return;
      if (tag === 'BR') { flush(); return; }
      let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
      const disp = cs.display;
      if (disp === 'none') return;
      const contents = disp === 'contents';
      const r = el.getBoundingClientRect();
      if (!contents) {
        if (+cs.opacity === 0) return;
        if (r.width <= 1.5 && r.height <= 1.5 && cs.overflowX !== 'visible') return; // sr-only
        if (cs.clipPath === 'inset(50%)' || cs.clip === 'rect(0px, 0px, 0px, 0px)') return;
        if ((r.width < 1 || r.height < 1) && cs.overflowX !== 'visible' && cs.overflowY !== 'visible') return; // collapsed panel
      }
      const role = el.getAttribute('role') || '';
      const nc = { hc: c.hc, sc: c.sc, h: c.h, ov: c.ov, sem: c.sem, ptr: c.ptr, alert: c.alert, inert: c.inert, mark: c.mark, fx: c.fx, vis: cs.visibility === 'visible', tt: cs.textTransform };
      if (cs.position === 'fixed') { nc.hc = null; nc.sc = null; nc.fx = true; } else if (cs.position === 'sticky') nc.fx = true;
      const oi = ovIdx.get(el); if (oi !== undefined) nc.ov = oi;
      const hm = /^H([1-6])$/.exec(tag);
      if (hm) nc.h = +hm[1]; else if (role === 'heading') nc.h = Math.min(6, Math.max(1, +el.getAttribute('aria-level') || 2));
      if (role === 'alert' || role === 'status' || el.hasAttribute('data-sonner-toast')) nc.alert = true;
      if (el.hasAttribute('inert')) nc.inert = true;
      const block = !contents && disp.indexOf('inline') !== 0;
      if (block) flush(); else if (!contents && disp !== 'inline' && run) run.parts.push(' ');

      let item = null;
      if (nc.vis && !nc.inert && !proxied.has(el)) {
        let handle = el, kind = kindOf(el, tag, role), generic = false;
        if (!kind && tag === 'LABEL') {
          const ctl = el.control; // a styled label standing in for a visually hidden checkbox/radio/file input
          if (ctl && tagOf(ctl) === 'INPUT' && /^(checkbox|radio|file)$/.test(ctl.type) && !proxied.has(ctl) && !rendered(ctl)) { handle = ctl; kind = kindOf(ctl); proxied.add(ctl); }
        } else if (!kind && !c.sem && el !== body && (reactClick(el) || (cs.cursor === 'pointer' && !c.ptr))) { kind = tag === 'A' ? 'link' : 'clickable'; generic = true; }
        if (kind) {
          let R = rc(r);
          if (R.r - R.l < 1 || R.b - R.t < 1) R = childBox(el) || R;
          const p = R.r - R.l >= 1 && R.b - R.t >= 1 ? place(R, nc.hc, nc.sc) : null;
          if (p) { item = { k: raw.length, el: handle, tgt: el, kind, generic, R, grp: p.grp, I: p.I, ov: nc.ov, fx: nc.fx }; raw.push(item); }
        }
      }
      if (item) { if (!item.generic) nc.sem = true; nc.mark = { s: '\u0001' + item.k + '\u0002', used: false, up: c.mark }; }
      nc.ptr = cs.cursor === 'pointer';
      if (!contents && el !== body) {
        const ox = cs.overflowX, oy = cs.overflowY;
        if (ox !== 'visible' || oy !== 'visible') {
          const sy = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
          const sx = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
          const INF = 1e7;
          const hb = { l: sx || ox === 'visible' ? -INF : r.left, r: sx || ox === 'visible' ? INF : r.right, t: sy || oy === 'visible' ? -INF : r.top, b: sy || oy === 'visible' ? INF : r.bottom };
          nc.hc = nc.hc ? isect(nc.hc, hb) : hb;
          if (sx || sy) { const sb = { l: sx ? r.left : -INF, r: sx ? r.right : INF, t: sy ? r.top : -INF, b: sy ? r.bottom : INF }; nc.sc = nc.sc ? isect(nc.sc, sb) : sb; }
        }
      }
      if (tag === 'IMG') {
        const alt = norm(el.getAttribute('alt'));
        if (nc.vis && alt && r.width >= 8) addText(' (image: ' + cut(alt, 60) + ') ', r, nc);
        else if (nc.vis && r.width >= 80 && r.height >= 80) addText(' (image ' + Math.round(r.width) + 'x' + Math.round(r.height) + ') ', r, nc);
      } else if (tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO') {
        if (nc.vis && r.width >= 80 && r.height >= 60) addText(' (' + (tag === 'SVG' ? 'graphic' : tag.toLowerCase()) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' — use shot to see it) ', r, nc);
      } else if (tag === 'IFRAME') {
        if (nc.vis) addText(' (iframe — its contents are not readable here) ', r, nc);
      } else if (!LEAF[tag]) {
        for (let n = el.firstChild; n; n = n.nextSibling) { if (n.nodeType === 3) textNode(n, nc); else if (n.nodeType === 1) visit(n, nc); }
      }
      if (item && !nc.mark.used) addText('', { left: item.R.l, top: item.R.t, right: item.R.r, bottom: item.R.b }, nc);
      if (block) flush(); else if (!contents && disp !== 'inline' && run) run.parts.push(' ');
    };
    visit(body, { hc: null, sc: null, h: 0, ov: -1, sem: false, ptr: false, alert: false, inert: false, mark: null, fx: false, vis: true, tt: 'none' });
    flush();

    for (const it of raw) { const li = labelInfo(it.el, it.kind, it.tgt); it.label = li.label; it.hint = li.hint; it.near = li.near; }
    // a generic click target that only wraps a real control (or the whole page) is noise
    let items = raw.filter((g) => {
      if (!g.generic) return true;
      const huge = (g.R.r - g.R.l) * (g.R.b - g.R.t) >= vw * vh * 0.8;
      for (const x of raw) { if (x !== g && g.tgt.contains(x.tgt) && (huge || x.label === g.label)) return false; }
      return true;
    });
    // is this point covered by a fixed/sticky bar (header, bottom nav)? then what sits there is scrolled under it, not in view
    const barCache = new Map();
    const underBar = (x, y) => {
      for (let q = document.elementFromPoint(x, y); q && q !== body; q = q.parentElement) {
        let ps = barCache.get(q);
        if (ps === undefined) { ps = getComputedStyle(q).position; barCache.set(q, ps); }
        if (ps === 'fixed' || ps === 'sticky') return true;
      }
      return false;
    };
    for (const it of items) {
      if (it.grp !== 'view') continue;
      const I = it.I, w = I.r - I.l, h = I.b - I.t, cx = I.l + w / 2, cy = I.t + h / 2;
      const pts = [[cx, cy], [I.l + w * 0.25, cy], [I.l + w * 0.75, cy], [cx, I.t + h * 0.25], [cx, I.t + h * 0.75]];
      it.hit = false;
      for (const pt of pts) { if (hitOK(document.elementFromPoint(pt[0], pt[1]), it.el, it.tgt)) { it.hit = true; break; } }
      if (!it.hit && !it.fx && !ovs.length && underBar(cx, cy)) it.grp = cy > vh / 2 ? 'below' : 'above';
    }
    if (!ovs.length) for (const s of segs) {
      if (s.grp !== 'view' || s.fx) continue;
      const cx = (s.I.l + s.I.r) / 2, cy = (s.I.t + s.I.b) / 2;
      if (underBar(cx, cy)) s.grp = cy > vh / 2 ? 'below' : 'above';
    }
    const hasOv = ovs.length > 0, topOv = ovs.length - 1;
    let modal = hasOv && (getComputedStyle(body).pointerEvents === 'none' || ovs.some((o) => o.modal));
    if (hasOv && !modal) { const pv = items.filter((it) => it.ov < 0 && it.grp === 'view'); if (pv.length && pv.every((it) => !it.hit)) modal = true; }
    if (hasOv) {
      items = items.filter((it) => {
        const b = it.ov < 0 ? (modal || (it.grp === 'view' && !it.hit)) : (it.grp === 'view' && !it.hit && it.ov !== topOv);
        if (b) res.blockedItems.push(it);
        return !b;
      });
    }
    const order = (list) => {
      const a = list.slice().sort((x, y) => (x.R.t - y.R.t) || (x.R.l - y.R.l));
      const rows = []; let row = null;
      for (const it of a) {
        const f = row && row.items[0].R, r = it.R;
        const inside = f && r.l >= f.l - 1 && r.r <= f.r + 1 && r.t >= f.t - 1 && r.b <= f.b + 1 && (f.r - f.l) * (f.b - f.t) > (r.r - r.l) * (r.b - r.t) * 1.5;
        if (f && !inside && Math.min(f.b, r.b) - Math.max(f.t, r.t) >= 0.5 * Math.min(f.b - f.t, r.b - r.t)) row.items.push(it);
        else { row = { items: [it] }; rows.push(row); }
      }
      const out = [];
      for (const rw of rows) { rw.items.sort((x, y) => (rtl ? y.R.r - x.R.r : x.R.l - y.R.l)); for (const it of rw.items) out.push(it); }
      return out;
    };
    // in view: top bars first, then the content, then bottom bars — the way a user reads the screen
    const viewOrder = (list) => {
      const top = [], mid = [], bot = [];
      for (const it of list) (it.fx ? ((it.R.t + it.R.b) / 2 < vh / 2 ? top : bot) : mid).push(it);
      return order(top).concat(order(mid), order(bot));
    };
    const GR = ['above', 'view', 'below', 'side'];
    for (const inOv of hasOv ? [true, false] : [false]) for (const g of GR) for (const it of (g === 'view' ? viewOrder : order)(items.filter((x) => (x.ov >= 0) === inOv && x.grp === g))) res.items.push(it);

    // text: merge neighbours that sit on one visual row ("Dana | 12 | +3"), then group like the elements
    let sg = segs;
    if (modal && !all) { sg = segs.filter((s) => s.ov >= 0); res.hiddenText = segs.length - sg.length; }
    const sameRow = (a, b) => { const ov = Math.min(a.b, b.b) - Math.max(a.t, b.t), mh = Math.min(a.b - a.t, b.b - b.t); return mh > 0 && ov >= mh * 0.5 && (b.l >= a.r - 2 || b.r <= a.l + 2); };
    const merged = [];
    for (const s of sg) {
      const p = merged[merged.length - 1];
      if (p && p.grp === s.grp && (p.ov >= 0) === (s.ov >= 0) && !s.h && sameRow(p.last, s.R) && p.text.length + s.text.length <= 160) { p.text += ' | ' + s.text; p.last = s.R; }
      else merged.push({ text: s.text, grp: s.grp, ov: s.ov, h: s.h, alert: s.alert, last: s.R });
    }
    for (const inOv of hasOv ? [true, false] : [false]) for (const g of GR) for (const s of merged) if ((s.ov >= 0) === inOv && s.grp === g) res.segs.push(s);
    res.overlays = ovs.map((o) => ({ kind: o.kind, label: o.label }));
    res.modal = modal;
    res.blocked = res.blockedItems.length;
    const sc = pickScroller(ovs);
    res.scroll = sc ? { y: sc.y, max: sc.max } : null;
    return res;
  };
  const fpOf = (it) => it.kind + '\n' + cut(it.label, 80);

  B.look = (o) => {
    o = o || {};
    const s = scan(!!o.all);
    const cap = o.all ? { view: 1e9, below: 1e9, above: 1e9, side: 1e9 } : { view: 150, below: 25, above: 10, side: 10 };
    const tcap = o.all ? cap : { view: 150, below: 25, above: 0, side: 10 };
    const key = (x) => (x.ov >= 0 ? 'o' : 'p') + x.grp;
    const limiter = (list, caps) => {
      const tot = {}, seen = {};
      for (const x of list) { const k = key(x); tot[k] = (tot[k] || 0) + 1; }
      return (x) => { const k = key(x), n = (seen[k] = (seen[k] || 0) + 1), c = caps[x.grp]; return x.grp === 'above' ? n > tot[k] - c : n <= c; };
    };
    const els = [null], tgts = [null], items = [], idx = new Map();
    let cutItems = 0;
    const keepItem = limiter(s.items, cap);
    for (const it of s.items) {
      if (!keepItem(it)) { cutItems++; continue; }
      const i = els.length;
      els.push(it.el); tgts.push(it.tgt); idx.set(it.k, i);
      items.push({ i, g: key(it), kind: it.kind, label: cut(it.label, 80), st: stateOf(it.el, it.kind, it.hint) });
    }
    B.els = els; B.tgts = tgts; B.gen = o.gen;
    const lines = [], cutLines = { above: 0, below: 0, side: 0, view: 0 };
    const keepLine = limiter(s.segs, tcap);
    for (const sg of s.segs) {
      let t = norm(sg.text.replace(/\u0001(\d+)\u0002/g, (m, k) => { const i = idx.get(+k); return i ? ' [' + i + '] ' : ' '; }));
      if (!t) continue;
      if (!keepLine(sg)) { cutLines[sg.grp]++; continue; }
      if (!o.all) t = cut(t, 240);
      lines.push({ g: key(sg), t: (sg.h ? '#'.repeat(sg.h) + ' ' : '') + (sg.alert ? '(alert) ' : '') + t });
    }
    return {
      url: location.href, title: document.title, vw: innerWidth, vh: innerHeight, scroll: s.scroll, overlays: s.overlays, modal: s.modal,
      items, lines, blocked: s.blocked, cutItems, cutLines, hiddenText: s.hiddenText, focus: Math.max(0, els.indexOf(document.activeElement)),
    };
  };

  const findText = (q) => {
    const exact = [], part = [], seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (!p || seen.has(p) || SKIP[tagOf(p)] || !lc(n.nodeValue)) continue;
      const pt = lc(textOf(p));
      const ex = pt === q || lc(n.nodeValue) === q;
      if (!ex && !pt.includes(q)) continue;
      if (!shown(p)) continue;
      seen.add(p); (ex ? exact : part).push(p);
    }
    const list = exact.length ? exact : part;
    return list.filter((e) => !list.some((x) => x !== e && e.contains(x)));
  };

  // Turn "3", "Sign in" or css=… into one element (kept in B.cur) — or say exactly why not.
  B.resolve = (a) => {
    const spec = a.spec, purpose = a.purpose;
    let el = null, tgt = null, note = '';
    B.cand = [];
    if (spec.idx) {
      if (B.gen === spec.gen && B.els[spec.idx] && B.els[spec.idx].isConnected) { el = B.els[spec.idx]; tgt = B.tgts[spec.idx]; }
      else if (spec.fp) { // the node was replaced (re-render, reload): find the same control again by kind + label + position among twins
        const same = scan(false).items.filter((it) => fpOf(it) === spec.fp);
        if (same.length === spec.cnt && same[spec.ord]) { el = same[spec.ord].el; tgt = same[spec.ord].tgt; note = 'the page re-rendered since the listing; matched again by label'; }
      }
      if (!el) return { ok: false, code: 'stale' };
      if (!shown(tgt)) return { ok: false, code: 'stale' };
    } else if (spec.css != null) {
      let list;
      try { list = Array.from(document.querySelectorAll(spec.css)); } catch (e) { return { ok: false, code: 'badcss' }; }
      if (!list.length) return { ok: false, code: 'nocss' };
      el = tgt = list.find(shown) || null;
      if (!el) return { ok: false, code: 'hiddencss', n: list.length };
      if (list.length > 1) note = 'css matched ' + list.length + ' elements; used the first visible one';
    } else {
      const q = lc(spec.text);
      const sc = scan(false);
      const usable = (it) => (purpose === 'type' ? typeable(it.el) : purpose === 'select' ? tagOf(it.el) === 'SELECT' : true);
      const pool = sc.items.filter(usable);
      // what a control can be called besides its label: placeholder, icon name, field name, or (unlabelled fields) the text just before it
      const others = (it) => {
        const k = [];
        const ph = it.el.getAttribute('placeholder'); if (ph) k.push(lc(ph));
        if (purpose !== 'click') { const nm = it.el.getAttribute('name'); if (nm) k.push(lc(nm)); }
        if (it.hint && it.hint.indexOf('icon=') === 0) k.push(it.hint.slice(5));
        if (it.near) k.push(lc(it.near));
        return k;
      };
      const keys = (it) => [lc(it.label)].concat(others(it));
      let hits = [];
      for (const test of [(it) => lc(it.label) === q, (it) => others(it).some((k) => k === q), (it) => !!it.label && lc(it.label).includes(q), (it) => others(it).some((k) => k.includes(q))]) {
        hits = pool.filter(test);
        if (hits.length) break; // exact label beats exact placeholder/nearby text beats partial matches
      }
      if (hits.length > 1) { const inner = hits.filter((h) => !hits.some((x) => x !== h && h.tgt.contains(x.tgt))); if (inner.length) hits = inner; }
      if (hits.length > 1) { B.cand = hits.map((h) => ({ el: h.el, kind: h.kind, label: h.label, hint: h.hint })); return { ok: false, code: 'ambiguous', n: hits.length }; }
      if (hits.length === 1) { el = hits[0].el; tgt = hits[0].tgt; }
      else if (sc.blockedItems.filter(usable).some((it) => keys(it).some((k) => k && k.includes(q)))) return { ok: false, code: 'blocked' };
      else if (purpose === 'click') {
        const t = findText(q);
        if (t.length === 1) { el = tgt = t[0]; note = 'plain text, not a detected control'; }
        else if (t.length > 1) return { ok: false, code: 'ambigtext', n: t.length };
      }
      if (!el) {
        const words = q.split(' ').filter((w) => w.length >= 3);
        const near = pool.filter((it) => words.some((w) => lc(it.label).includes(w))).slice(0, 5).map((it) => it.kind + ' "' + cut(it.label, 40) + '"');
        return { ok: false, code: 'none', near };
      }
    }
    if (purpose === 'type' && !typeable(el)) {
      const inner = tagOf(el) === 'LABEL' && el.control ? el.control : el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=""],[contenteditable="true"]');
      if (inner && typeable(inner)) { el = tgt = inner; } else return { ok: false, code: 'nottype', what: brief(el) };
    }
    if (purpose === 'select' && tagOf(el) !== 'SELECT') {
      const inner = tagOf(el) === 'LABEL' && el.control ? el.control : null;
      if (inner && tagOf(inner) === 'SELECT') { el = tgt = inner; } else return { ok: false, code: 'notselect', what: brief(el), custom: kindOf(el) === 'combobox' };
    }
    B.cur = el; B.tgt = tgt || el;
    const kind = kindOf(el) || tagOf(el).toLowerCase(), li = labelInfo(el, kind, B.tgt);
    return { ok: true, idx: B.gen === a.gen ? Math.max(0, B.els.indexOf(el)) : 0, kind, label: cut(li.label, 80), hint: li.hint, disabled: isDisabled(el), readonly: el.readOnly === true, note };
  };
  B.candInfo = () => B.cand.map((c) => {
    let ctx = '';
    for (let p = c.el.parentElement, n = 0; p && p !== document.body && n < 6; p = p.parentElement, n++) { const t = textOf(p); if (t.length > c.label.length + 3) { ctx = cut(t, 70); break; } }
    return { idx: Math.max(0, B.els.indexOf(c.el)), kind: c.kind, label: cut(c.label, 80), st: stateOf(c.el, c.kind, c.hint), ctx };
  });

  // Bring the resolved element on screen and find a point where a real tap would land on it.
  B.prepClick = async (a) => {
    const el = B.cur, tgt = B.tgt || el;
    if (!el || !tgt.isConnected) return { error: 'gone' };
    const pointFor = () => {
      const vw = innerWidth, vh = innerHeight;
      let r = tgt.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { const cb = Array.from(tgt.children).map((c) => c.getBoundingClientRect()).find((q) => q.width > 0 && q.height > 0); if (!cb) return { none: true }; r = cb; }
      const I = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, vw), b: Math.min(r.bottom, vh) };
      if (I.r - I.l < 1 || I.b - I.t < 1) return { off: true };
      const w = I.r - I.l, h = I.b - I.t, cx = I.l + w / 2, cy = I.t + h / 2;
      const pts = [[cx, cy], [I.l + w * 0.25, cy], [I.l + w * 0.75, cy], [cx, I.t + h * 0.25], [cx, I.t + h * 0.75]];
      const rects = tgt.getClientRects();
      for (let i = 0; i < rects.length && i < 3 && rects.length > 1; i++) pts.push([(rects[i].left + rects[i].right) / 2, (rects[i].top + rects[i].bottom) / 2]);
      let cover = null;
      for (const p of pts) {
        if (p[0] < 0 || p[1] < 0 || p[0] >= vw || p[1] >= vh) continue;
        const h2 = document.elementFromPoint(p[0], p[1]);
        if (hitOK(h2, el, tgt)) return { x: Math.round(p[0]), y: Math.round(p[1]), full: r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw, key: Math.round(r.left) + ',' + Math.round(r.top) };
        if (!cover) cover = h2;
      }
      return { cover: brief(cover), cx: Math.round(cx), cy: Math.round(cy), key: Math.round(r.left) + ',' + Math.round(r.top) };
    };
    let p = pointFor(), scrolled = false;
    if (p.x === undefined || !p.full) {
      try { tgt.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) { tgt.scrollIntoView(); }
      scrolled = true;
      await frames(2);
      p = pointFor();
    }
    for (let i = 0, prev = null; i < 8; i++) { // let scrolling and slide-in animations come to rest
      if (p.x !== undefined && p.key === prev) break;
      prev = p.key;
      await frames(3);
      p = pointFor();
    }
    if (p.x === undefined) {
      if (a && a.force && p.cx !== undefined) return { x: p.cx, y: p.cy, scrolled, forced: true };
      return p.none ? { error: 'nosize' } : p.off ? { error: 'offscreen' } : { error: 'covered', by: p.cover };
    }
    return { x: p.x, y: p.y, scrolled };
  };
  B.mark = () => ({ t: pnow(), id: B.id });
  B.seen = (m) => m.id !== B.id || B.down >= m.t || B.click >= m.t;

  const setNative = (el, v) => {
    const proto = tagOf(el) === 'TEXTAREA' ? HTMLTextAreaElement.prototype : tagOf(el) === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v; // bypasses React's value tracker so the next input event counts
  };
  B.prepType = async (a) => {
    const el = B.cur;
    if (!el || !el.isConnected) return { error: 'the field disappeared' };
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) { try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) {} await frames(2); }
    try { el.focus({ preventScroll: true }); } catch (e) {}
    if (document.activeElement !== el) return { error: 'it cannot take focus (focus went to ' + brief(document.activeElement) + ')' };
    if (tagOf(el) !== 'INPUT' && tagOf(el) !== 'TEXTAREA') { // contenteditable
      const before = textOf(el), sel = getSelection();
      sel.selectAllChildren(el);
      if (a.append) sel.collapseToEnd();
      return { mode: 'insert', before };
    }
    const before = el.value || '';
    const ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (tagOf(el) === 'INPUT' && SET_TYPES[ty]) return { mode: 'set', before };
    const clear = () => { if (el.value !== '') { setNative(el, ''); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); } };
    if (!a.append) { clear(); return { mode: 'insert', before }; }
    try { el.setSelectionRange(before.length, before.length); return { mode: 'insert', before }; }
    catch (e) { clear(); return { mode: 'insert', before, prefix: before }; } // email/number: no caret API, so retype
  };
  B.fieldValue = () => { const el = B.cur; return { value: el ? (el.value != null ? String(el.value) : textOf(el)) : '', password: !!el && el.type === 'password' }; };
  B.setValue = (v) => {
    const el = B.cur;
    if (el.value === undefined) { el.textContent = v; el.dispatchEvent(new InputEvent('input', { bubbles: true })); return B.fieldValue(); }
    setNative(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return B.fieldValue();
  };
  B.selectOption = (text) => {
    const el = B.cur, q = lc(text), opts = Array.from(el.options);
    const names = opts.map((o) => norm(o.textContent));
    let hit = opts.filter((o) => lc(o.textContent) === q || lc(o.value) === q);
    if (!hit.length) hit = opts.filter((o) => lc(o.textContent).includes(q));
    if (hit.length !== 1) return { error: hit.length ? 'ambiguous' : 'none', options: names };
    if (hit[0].disabled) return { error: 'disabled', options: names };
    try { el.focus({ preventScroll: true }); } catch (e) {}
    setNative(el, hit[0].value);
    hit[0].selected = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { text: norm(hit[0].textContent) };
  };
  B.scroll = async (a) => {
    if (a.text != null) {
      const t = findText(lc(a.text));
      if (!t.length) return { error: 'notext' };
      try { t[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (e) { t[0].scrollIntoView(); }
      await frames(2);
      const r = t[0].getBoundingClientRect();
      return { ok: true, text: true, visible: r.bottom > 0 && r.top < innerHeight, n: t.length };
    }
    const sc = pickScroller(findOverlays());
    if (!sc) return { ok: true, none: true };
    const step = Math.max(100, Math.round(sc.h * 0.85));
    const to = a.dir === 'top' ? 0 : a.dir === 'bottom' ? sc.max : a.dir === 'down' ? Math.min(sc.max, sc.y + step) : Math.max(0, sc.y - step);
    if (sc.el) sc.el.scrollTo({ top: to, behavior: 'instant' }); else window.scrollTo({ top: to, behavior: 'instant' });
    await frames(2);
    const now = sc.el ? Math.round(sc.el.scrollTop) : Math.round(window.scrollY);
    return { ok: true, from: sc.y, to: now, max: sc.max, inner: sc.el ? brief(sc.el) : '' };
  };
  B.state = () => {
    let anim = 0;
    try {
      for (const an of document.getAnimations()) {
        if (an.playState !== 'running' || !an.effect || !an.effect.getComputedTiming) continue;
        const t = an.effect.getComputedTiming();
        if (isFinite(t.endTime) && t.endTime - (an.currentTime || 0) < 2500) anim++;
      }
    } catch (e) {}
    const t = pnow();
    return { mut: t - B.mut, sty: t - B.sty, anim, ready: document.readyState, n: B.id + B.mutN };
  };
  B.hasText = (q) => { try { return lc(document.body.innerText).includes(lc(q)); } catch (e) { return false; } };
  B.storage = () => {
    const dump = (name) => {
      let st; try { st = window[name]; } catch (e) { return null; }
      const o = [];
      try { for (let i = 0; i < st.length; i++) { const k = st.key(i); o.push([k, String(st.getItem(k))]); } } catch (e) { return null; }
      return o;
    };
    return { origin: location.origin, local: dump('localStorage'), session: dump('sessionStorage') };
  };
  return true;
}
const HELPER_SRC = `(${pageHelper.toString()})()`;
const HELPER_VERSION = 1;

// ───────────────────────────── daemon ─────────────────────────────
const KEYS = {
  enter: ['Enter', 'Enter', 13, '\r'], return: ['Enter', 'Enter', 13, '\r'], tab: ['Tab', 'Tab', 9], escape: ['Escape', 'Escape', 27], esc: ['Escape', 'Escape', 27],
  backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], del: ['Delete', 'Delete', 46], space: [' ', 'Space', 32, ' '], spacebar: [' ', 'Space', 32, ' '],
  arrowup: ['ArrowUp', 'ArrowUp', 38], arrowdown: ['ArrowDown', 'ArrowDown', 40], arrowleft: ['ArrowLeft', 'ArrowLeft', 37], arrowright: ['ArrowRight', 'ArrowRight', 39],
  up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
  home: ['Home', 'Home', 36], end: ['End', 'End', 35], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34],
};
const MODS = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };
function parseKey(spec) {
  const parts = spec === '+' ? ['+'] : spec.split('+').map((s) => (s === '' ? '+' : s));
  let modifiers = 0;
  while (parts.length > 1 && MODS[parts[0].toLowerCase()]) modifiers |= MODS[parts.shift().toLowerCase()];
  if (parts.length !== 1) return null;
  const k = parts[0], named = KEYS[k.toLowerCase()];
  if (named) return { key: named[0], code: named[1], vk: named[2], text: modifiers & ~8 ? undefined : named[3], modifiers, name: named[0] === ' ' ? 'Space' : named[0] };
  if ([...k].length !== 1) return null;
  const up = k.toUpperCase(), code = /[A-Z]/.test(up) ? 'Key' + up : /[0-9]/.test(k) ? 'Digit' + k : '';
  const ch = modifiers & 8 ? up : k;
  return { key: ch, code, vk: /[A-Z0-9]/.test(up) ? up.charCodeAt(0) : 0, text: modifiers & ~8 ? undefined : ch, modifiers, name: k };
}

async function daemonMain(session, sdir, presetName) {
  const profile = path.join(sdir, 'profile'), shotsDir = path.join(sdir, 'shots');
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  const log = (s) => { try { process.stdout.write(`[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${s}\n`); } catch {} };
  process.on('uncaughtException', (e) => log('uncaught: ' + (e?.stack || e)));
  process.on('unhandledRejection', (e) => log('unhandled: ' + (e?.stack || e)));

  const chromePath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!chromePath) { log('FATAL Google Chrome not found (looked in: ' + CHROME_PATHS.join(', ') + ')'); process.exit(2); }
  const preset = PRESETS[presetName] ? presetName : 'phone';
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${PRESETS[preset].w},${PRESETS[preset].h}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update', '--disable-default-apps', '--disable-sync',
    '--disable-background-networking', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=Translate,MediaRouter,OptimizationHints', '--password-store=basic', '--use-mock-keychain', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let quitting = false;
  const hardExit = (code) => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(sessionFile(sdir), { force: true }); } catch {} process.exit(code); };
  chrome.on('exit', (c, s) => { if (!quitting) { log(`Chrome exited (${c ?? s}) — daemon stops`); hardExit(0); } });
  process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} });

  let wsUrl;
  try {
    wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { if (buf.length < 65536) buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
      setTimeout(() => reject(new Error('Chrome did not open a DevTools endpoint: ' + cut(oneLine(buf), 300))), 15000);
    });
  } catch (e) { log('FATAL ' + e.message); hardExit(2); }

  const cdp = new CDP();
  await cdp.connect(wsUrl);
  const als = new AsyncLocalStorage();
  const S = {
    epoch: 0, vp: null, policy: 'accept', promptText: null, events: [], seq: 0, reported: 0, inflight: new Map(), loading: false, lastNet: 0, lastNav: 0,
    mainFrame: null, docStatus: null, noisyUrl: null, slowKeys: new Set(), gen: 0, fps: [], lastLines: null, shotN: 0, startedAt: Date.now(), lastCmdAt: Date.now(), url: 'about:blank', desktopUA: '',
  };
  try { for (const f of fs.readdirSync(shotsDir)) { const m = /^(\d+)/.exec(f); if (m) S.shotN = Math.max(S.shotN, +m[1]); } } catch {}
  let targetId = null, sid = null;

  // send to the page; a command that ran past its deadline is cut off here so it cannot disturb the next one
  const send = (method, params, timeout) => {
    const st = als.getStore();
    if (st && st.epoch !== S.epoch) return Promise.reject(new Error('command was cut off'));
    return cdp.send(method, params || {}, sid, timeout);
  };
  const left = () => { const st = als.getStore(); return st ? st.deadline - Date.now() : CMD_DEADLINE; };

  const record = (kind, text, extra) => {
    const ev = { n: ++S.seq, t: Date.now(), kind, text: cut(oneLine(text), 400), at: S.url, ...extra };
    S.events.push(ev);
    if (S.events.length > 1000) S.events.splice(0, S.events.length - 1000);
    log(`event ${kind}: ${ev.text}`);
    return ev;
  };
  const shortUrl = (u) => { try { const x = new URL(u), o = new URL(S.url); return cut(x.origin === o.origin ? x.pathname + x.search + x.hash : x.href, 140); } catch { return cut(u, 140); } };
  const argText = (a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description ?? a.unserializableValue ?? a.type);
  const popups = new Set();

  cdp.onevent = (m) => {
    const p = m.params || {};
    if (m.method === 'Target.targetCreated') {
      const ti = p.targetInfo;
      if (ti.type === 'page' && targetId && ti.targetId !== targetId && !popups.has(ti.targetId)) {
        popups.add(ti.targetId);
        setTimeout(async () => {
          let url = ti.url;
          try { url = (await cdp.send('Target.getTargetInfo', { targetId: ti.targetId })).targetInfo.url || url; } catch {}
          record('popup', `a new tab opened (${url || 'about:blank'}) and was closed — this driver has one tab; use goto to visit it`);
          try { await cdp.send('Target.closeTarget', { targetId: ti.targetId }); } catch {}
        }, 700);
      }
      return;
    }
    if (m.sessionId !== sid) return;
    switch (m.method) {
      case 'Page.javascriptDialogOpening': {
        const accept = p.type === 'beforeunload' || p.type === 'alert' ? true : S.policy === 'accept';
        const answer = p.type === 'prompt' && accept ? (S.promptText ?? p.defaultPrompt ?? '') : undefined;
        const what = p.type === 'alert' ? 'closed' : p.type === 'beforeunload' ? 'accepted (left the page)' : accept ? 'accepted (OK)' : 'dismissed (Cancel)';
        record('dialog', `${p.type} "${cut(oneLine(p.message), 300)}" → ${what}${answer !== undefined ? ` with "${answer}"` : ''}`);
        cdp.send('Page.handleJavaScriptDialog', { accept, promptText: answer }, sid).catch((e) => log('dialog handling failed: ' + e.message));
        break;
      }
      case 'Runtime.consoleAPICalled':
        if (p.type === 'error' || p.type === 'assert') record('console.error', (p.args || []).map(argText).join(' '));
        break;
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails || {};
        const desc = d.exception?.description || d.exception?.value || d.text || 'unknown error';
        const where = d.url ? ` (${shortUrl(d.url)}:${d.lineNumber + 1})` : '';
        record('exception', String(desc).split('\n').slice(0, 2).join(' ') + where);
        break;
      }
      case 'Log.entryAdded':
        if (p.entry.level === 'error' && p.entry.source !== 'network') record('browser', p.entry.text);
        break;
      case 'Network.requestWillBeSent':
        if (/^(data|blob|about):/.test(p.request.url)) break;
        S.inflight.set(p.requestId, { t: Date.now(), url: p.request.url, method: p.request.method, type: p.type, loader: p.loaderId });
        break;
      case 'Network.responseReceived': {
        const r = S.inflight.get(p.requestId);
        if (r) r.prog = Date.now();
        if (p.type === 'Document' && p.frameId === S.mainFrame) S.docStatus = p.response.status;
        if (p.response.status >= 400) {
          const ev = record('http', `${p.response.status} ${r?.method || 'GET'} ${shortUrl(p.response.url)}`);
          if (r) r.ev = ev;
        }
        break;
      }
      case 'Network.dataReceived': { const r = S.inflight.get(p.requestId); if (r) r.prog = Date.now(); break; }
      case 'Network.loadingFinished': {
        const r = S.inflight.get(p.requestId);
        S.inflight.delete(p.requestId); S.lastNet = Date.now();
        if (r?.ev && (r.type === 'XHR' || r.type === 'Fetch')) { // what did the API say?
          cdp.send('Network.getResponseBody', { requestId: p.requestId }, sid, 2500).then((b) => {
            const body = oneLine(b.base64Encoded ? '' : b.body);
            if (body) r.ev.text = r.ev.text + ' — ' + cut(body, 160);
          }).catch(() => {});
        }
        break;
      }
      case 'Network.loadingFailed': {
        const r = S.inflight.get(p.requestId);
        S.inflight.delete(p.requestId); S.lastNet = Date.now();
        if (r && !r.ev && !p.canceled && p.errorText !== 'net::ERR_ABORTED') record('failed', `${r.method} ${shortUrl(r.url)} (${p.blockedReason ? 'blocked: ' + p.blockedReason : p.errorText})`);
        break;
      }
      case 'Page.frameStartedLoading': if (p.frameId === S.mainFrame) S.loading = true; break;
      case 'Page.frameStoppedLoading': if (p.frameId === S.mainFrame) { S.loading = false; S.lastNav = Date.now(); } break;
      case 'Page.frameNavigated':
        if (!p.frame.parentId) {
          S.mainFrame = p.frame.id; S.url = p.frame.url; S.lastNav = Date.now();
          // requests of the previous document (keepalive beacons etc.) never report back: forget them
          for (const [id, r] of S.inflight) if (r.loader !== p.frame.loaderId) S.inflight.delete(id);
        }
        break;
      case 'Page.navigatedWithinDocument': if (p.frameId === S.mainFrame) { S.url = p.url; S.lastNav = Date.now(); } break;
      case 'Inspector.targetCrashed': record('crash', 'the page crashed — run reload (or goto)'); break;
    }
  };

  const applyViewport = async (v) => {
    await send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: v.mobile, screenWidth: v.w, screenHeight: v.h });
    await send('Emulation.setTouchEmulationEnabled', v.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await send('Emulation.setUserAgentOverride', v.mobile ? { userAgent: MOBILE_UA, platform: 'iPhone' } : { userAgent: S.desktopUA });
    S.vp = v;
  };
  const vpText = (v) => `${v.name} ${v.w}x${v.h} @${v.dpr}x ${v.touch ? 'touch' : 'mouse'}`;

  const attach = async (tid) => {
    targetId = tid;
    sid = (await cdp.send('Target.attachToTarget', { targetId: tid, flatten: true })).sessionId;
    await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable'), send('Log.enable')]);
    S.mainFrame = (await send('Page.getFrameTree')).frameTree.frame.id;
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await send('Page.addScriptToEvaluateOnNewDocument', { source: HELPER_SRC });
    await applyViewport(S.vp || { name: preset, ...PRESETS[preset] });
    S.inflight.clear(); S.loading = false; S.fps = []; S.lastLines = null;
  };
  // replace a frozen or crashed tab: cookies and localStorage survive, the page's in-memory state does not
  const freshTab = async () => {
    const old = targetId;
    const { targetId: tid } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    popups.add(tid);
    await attach(tid);
    cdp.send('Target.closeTarget', { targetId: old }).catch(() => {});
  };
  try {
    const ver = await cdp.send('Browser.getVersion');
    S.desktopUA = ver.userAgent.replace('HeadlessChrome', 'Chrome');
    const { targetInfos } = await cdp.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page') || { targetId: (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId };
    await attach(page.targetId);
    await cdp.send('Target.setDiscoverTargets', { discover: true });
  } catch (e) { log('FATAL setup failed: ' + (e.stack || e)); hardExit(2); }

  // ── page helper calls
  const pageCall = async (name, arg, timeout = 6000) => {
    const expression = `(() => { const b = window.__browse; if (!b || b.v !== ${HELPER_VERSION}) return { __missing: true }; return b[${JSON.stringify(name)}](${JSON.stringify(arg ?? null)}); })()`;
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try { res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeout); }
      catch (e) {
        last = e;
        if (/context|navigat|destroyed|collected|Cannot find/i.test(e.message) && left() > 1500) { await sleep(150); continue; } // the page is changing under us
        throw e;
      }
      if (res.exceptionDetails) {
        last = new Error('page script error: ' + oneLine(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
        if (/context|destroyed|collected/i.test(last.message) && left() > 1500) { await sleep(150); continue; }
        throw last;
      }
      const v = res.result.value;
      if (v && v.__missing) { await send('Runtime.evaluate', { expression: HELPER_SRC, returnByValue: true }, timeout).catch((e) => { last = e; }); continue; }
      return v;
    }
    throw last || new Error('the page is not answering');
  };

  // ── wait until the page has calmed down: no load in progress, no fresh requests, DOM quiet, animations done
  const settle = async (max = 5000, min = 120) => {
    const t0 = Date.now();
    max = Math.max(300, Math.min(max, left() - 3000));
    const background = new Set();
    for (const [id, r] of S.inflight) if (t0 - r.t > 1500) background.add(id); // long-polls and streams that were already running
    const noisy = S.noisyUrl === S.url; // this page is known to keep changing by itself (ticker, endless animation)
    let calm = 0, restless = false;
    await sleep(min);
    for (;;) {
      const now = Date.now();
      let busy = '', slow = '';
      if (S.loading) busy = 'the page is still loading';
      else {
        let n = 0;
        for (const [id, r] of S.inflight) {
          const age = now - r.t;
          if (age > 60000) { S.inflight.delete(id); continue; }
          if (background.has(id) || QUIET_TYPES.has(r.type) || LONG_POLL.test(r.url)) continue;
          if (r.prog && now - r.prog > 800) continue; // answered, body idle: a stream, or a keepalive fetch that never reports the end
          const key = r.method + ' ' + r.url.split('?')[0];
          if (age > 3500) S.slowKeys.add(key); // do not hold the command for it — and not the next ones either
          if (S.slowKeys.has(key)) slow = ` — ${r.method} ${shortUrl(r.url)} is still running (${Math.round(age / 1000)} s so far) and was not waited for; the page may still update (use wait)`;
          else n++;
        }
        if (n) busy = `${n} request(s) still in flight`;
        else if (now - S.lastNet < 120 || now - S.lastNav < 120) busy = 'just finished loading';
        else {
          let st = null;
          try { st = await pageCall('state', null, 3000); } catch {}
          if (!st) busy = 'the page is not answering yet';
          else if (st.ready !== 'complete') busy = 'the page is still loading';
          else if (st.mut < 250 || st.sty < 250 || st.anim) {
            if (!calm) calm = now;
            // wait for the page to stop changing, but not forever: some pages never stop
            if (now - calm < (noisy ? 400 : st.mut < 250 ? 1500 : 1000)) busy = 'the page is still changing';
            else restless = true;
          }
        }
      }
      if (busy !== 'the page is still changing') calm = busy ? 0 : calm;
      if (!busy) {
        if (restless && !noisy) { S.noisyUrl = S.url; slow += ' — the page keeps changing by itself (timer or animation), so this did not wait for it to settle'; }
        return { ms: Date.now() - t0, busy: '', slow };
      }
      if (Date.now() - t0 >= max) return { ms: Date.now() - t0, busy, slow: '' };
      await sleep(50);
    }
  };
  const settleNote = (s) => (s.busy ? ` — still busy after ${(s.ms / 1000).toFixed(1)} s (${s.busy}); use wait if something is missing` : s.slow);

  // ── look
  const doLook = async (all) => {
    const gen = S.gen + 1;
    const d = await pageCall('look', { gen, all: !!all }, 8000);
    S.gen = gen;
    const tot = {}, fps = [];
    for (const it of d.items) { const fp = it.kind + '\n' + it.label; fps[it.i] = { fp, ord: tot[fp] || 0 }; tot[fp] = (tot[fp] || 0) + 1; }
    for (const f of fps) if (f) f.cnt = tot[f.fp];
    S.fps = fps; S.url = d.url;
    return d;
  };
  const itemLine = (it, focus) => `[${it.i}] ${it.kind} ${it.label ? `"${it.label}"` : '(no label)'}${it.st ? ' ' + it.st : ''}${it.i === focus && /^(input|textarea|textbox|searchbox|spinbutton|select|combobox)/.test(it.kind) ? ' focused' : ''}`;
  const render = (d) => {
    const hasOv = d.overlays.length > 0;
    const L = [`URL ${d.url}`, `TITLE ${d.title || '(none)'}`];
    const sc = d.scroll;
    L.push(`VIEW ${S.vp.name} ${d.vw}x${d.vh} · ${!sc || sc.max <= 0 ? 'nothing to scroll' : `scrolled ${sc.y}/${sc.max}px${sc.y < sc.max - 1 ? ' (more below)' : ' (at the bottom)'}`}`);
    for (const o of d.overlays) L.push(`OVERLAY ${o.kind}${o.label ? ` "${o.label}"` : ''} is open${d.modal ? ' — the page behind it is blocked' : ''}`);
    const WHERE = { view: 'in view', above: 'above the viewport — scroll up', below: 'below the fold — scroll down', side: 'off to the side' };
    const head = (g) => `-- ${hasOv ? (g[0] === 'o' ? 'overlay, ' : 'page, ') : ''}${WHERE[g.slice(1)]} --`;
    L.push(d.items.length ? `ELEMENTS ${d.items.length}` : 'ELEMENTS none');
    let g = hasOv ? '' : 'pview';
    for (const it of d.items) { if (it.g !== g) { g = it.g; L.push(head(g)); } L.push(itemLine(it, d.focus)); }
    const f = d.focus ? d.items.find((it) => it.i === d.focus) : null;
    S.prevFocus = S.focusLine; S.focusLine = f ? itemLine(f) : '';
    // the page's skeleton: if it differs from the last listing, numbers may have moved and a short diff would mislead
    S.prevShape = S.shape;
    S.shape = d.overlays.map((o) => o.kind + o.label).join('|') + '#' + d.items.map((it) => it.g + it.kind).join(',');
    if (d.blocked) L.push(`(${d.blocked} page control(s) behind the overlay are not listed — close it to reach them)`);
    if (d.cutItems) L.push(`(+${d.cutItems} more controls not listed — scroll, or look --all)`);
    L.push(d.lines.length ? 'TEXT' : 'TEXT none');
    g = hasOv ? '' : 'pview';
    for (const ln of d.lines) { if (ln.g !== g) { g = ln.g; L.push(head(g)); } L.push(ln.t); }
    const c = d.cutLines;
    if (c.above) L.push(`(${c.above} line(s) above the viewport not shown — scroll up, or look --all)`);
    if (c.below + c.view + c.side) L.push(`(+${c.below + c.view + c.side} more line(s) not shown — scroll down, or look --all)`);
    if (d.hiddenText) L.push('(page text behind the overlay not shown — look --all includes it)');
    return L;
  };
  // after an action: the fresh listing if the page changed a lot, only the changed lines if it changed a little,
  // one line if it did not change at all. (--look forces the full listing.)
  const plain = (l) => l.replace(/ focused$/, '');
  const diffLines = (a, b) => {
    const n = a.length, m = b.length;
    if (n * m > 400000) return null;
    const A = a.map(plain), Bn = b.map(plain);
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === Bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0, changed = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === Bn[j]) { i++; j++; continue; }
      const del = [], add = [];
      while (i < n || j < m) {
        if (i < n && j < m && A[i] === Bn[j]) break;
        if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) add.push(b[j++]); else del.push(a[i++]);
      }
      changed += Math.max(del.length, add.length);
      if (del.length === add.length) for (const l of add) out.push('~ ' + l);
      else {
        if (!del.length && j - add.length > 0) out.push('  ' + b[j - add.length - 1]); // where the new lines sit
        for (const l of del) out.push('- ' + l);
        for (const l of add) out.push('+ ' + l);
      }
    }
    return changed > Math.max(12, Math.floor(m * 0.4)) ? null : out;
  };
  const domMark = async () => { try { return (await pageCall('state', null, 3000)).n; } catch { return null; } };
  const afterAction = async (first, flags, showFocus, mark) => {
    if (flags.quiet) return [first];
    const prev = S.lastLines;
    const body = render(await doLook(flags.all));
    S.lastLines = body;
    const d = prev && !flags.look && S.shape === S.prevShape ? diffLines(prev, body) : null;
    if (!d) return [first, ...body];
    const out = [first];
    if (d.length) out.push('CHANGED — only these lines differ from the last listing (same numbers; ~ changed, + new, - gone):', ...d);
    if (showFocus && S.focusLine && S.focusLine !== S.prevFocus) out.push('FOCUS is on ' + S.focusLine);
    if (!d.length) {
      const touched = mark !== undefined && mark !== (await domMark());
      out.push(touched ? 'LISTING unchanged, but the page itself changed in a way the markup does not expose (e.g. a highlight or selected style) — take a shot to see it' : 'PAGE unchanged since the last listing (same numbers still apply)');
    }
    return out;
  };

  // ── targets
  const resolveTarget = async (raw, purpose) => {
    let spec;
    if (/^\d+$/.test(raw)) {
      const i = +raw, f = S.fps[i];
      if (!S.fps.length) return { ok: false, lines: ['ERROR there is no element list yet — run look first, then use its numbers'] };
      if (!f) return { ok: false, lines: [`ERROR there is no [${i}] in the last listing (it has 1–${S.fps.length - 1}) — run look to see the current numbers`] };
      spec = { idx: i, gen: S.gen, fp: f.fp, ord: f.ord, cnt: f.cnt };
    } else if (raw.startsWith('css=')) spec = { css: raw.slice(4) };
    else spec = { text: raw.startsWith('text=') ? raw.slice(5) : raw };
    const r = await pageCall('resolve', { spec, purpose, gen: S.gen });
    if (r.ok) {
      r.desc = `${r.idx ? `[${r.idx}] ` : ''}${r.kind} ${r.label ? `"${r.label}"` : `(no label${r.hint ? '; ' + r.hint : ''})`}`;
      return r;
    }
    const noun = purpose === 'type' ? 'text field' : purpose === 'select' ? 'native <select>' : 'element';
    const relist = async (first) => { const body = render(await doLook(false)); S.lastLines = body; return { ok: false, lines: [first, ...body] }; };
    switch (r.code) {
      case 'stale': return relist(`ERROR [${spec.idx}] is no longer on the page — it changed since the last listing. Nothing was done; here is the current page, pick again:`);
      case 'ambiguous': {
        const prev = S.lastLines;
        const body = render(await doLook(false));
        const cands = await pageCall('candInfo');
        const changed = !prev || prev.map(plain).join('\n') !== body.map(plain).join('\n');
        S.lastLines = body;
        const lines = [`ERROR "${spec.text}" matches ${r.n} ${noun}s — nothing was done. Use the number of the one you mean:`];
        for (const c of cands) lines.push(`${c.idx ? `[${c.idx}]` : '[not in the listing — scroll first]'} ${c.kind} ${c.label ? `"${c.label}"` : '(no label)'}${c.st ? ' ' + c.st : ''}${c.ctx ? `  — in: "${c.ctx}"` : ''}`);
        return { ok: false, lines: changed ? [...lines, 'The page changed since the last listing; current page:', ...body] : lines };
      }
      case 'ambigtext': return { ok: false, lines: [`ERROR "${spec.text}" appears ${r.n} times as plain text and is not a recognised control — use css=SELECTOR or xy=X,Y (take a shot to find the spot)`] };
      case 'blocked': return { ok: false, lines: [`ERROR "${spec.text}" is behind the open overlay and cannot be reached — close the overlay first (press Escape, or click its close button), then retry`] };
      case 'none': return { ok: false, lines: [`ERROR no visible ${noun} matches "${spec.text}"${r.near?.length ? ` — closest: ${r.near.join(', ')}` : ''} — run look and use a number, or css=SELECTOR`] };
      case 'badcss': return { ok: false, lines: [`ERROR "${spec.css}" is not a valid CSS selector — example: css=button[type=submit]`] };
      case 'nocss': return { ok: false, lines: [`ERROR nothing matches css=${spec.css} — run look, or check the selector with: eval document.querySelectorAll('${spec.css.replace(/'/g, '"')}').length`] };
      case 'hiddencss': return { ok: false, lines: [`ERROR css=${spec.css} matches ${r.n} element(s) but none is visible — it may be hidden or not rendered yet (try wait)`] };
      case 'nottype': return { ok: false, lines: [`ERROR ${r.what} is not a text field — type needs an input or textarea (use click for buttons, select for dropdowns)`] };
      case 'notselect': return { ok: false, lines: [`ERROR ${r.what} is not a native <select>${r.custom ? ' — it is a custom dropdown: click it to open, then click the option' : ' — use click instead'}`] };
      default: return { ok: false, lines: [`ERROR could not find the target (${r.code})`] };
    }
  };

  const mouseClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  };
  // a real tap on touch presets, a real mouse click on desktop
  const tapOrClick = async (x, y) => {
    if (!S.vp.touch) { await mouseClick(x, y); return ''; }
    let mark = null;
    try { mark = await pageCall('mark', null, 3000); } catch {}
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 0.5 }] });
    await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (!mark) return '';
    for (const pause of [60, 250]) {
      await sleep(pause);
      let seen = true;
      try { seen = await pageCall('seen', mark, 3000); } catch {}
      if (seen) return '';
    }
    await mouseClick(x, y);
    return ' (the touch tap produced no events, so a mouse click was used)';
  };
  const curUrl = async () => { try { return (await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, 3000)).result.value; } catch { return S.url; } };
  const navNote = (before, after) => (after && before !== after ? ` → now at ${shortUrl(after)}` : '');
  const normalizeUrl = (u, cur) => {
    if (/^(about|data|file|blob|chrome):/i.test(u) || /^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
    if (/^[/#?.]/.test(u)) { if (!/^https?:/.test(cur)) throw new Error('no page is open yet, so a relative URL has nothing to resolve against'); return new URL(u, cur).href; }
    return 'http://' + u;
  };
  const fail = (line) => [line.startsWith('ERROR') ? line : 'ERROR ' + line];

  const handlers = {
    async ping() { return [`OK ${vpText(S.vp)} at ${await curUrl()}`]; },
    async stop() { return ['OK stopping']; },

    async goto(args, flags) {
      if (!args[0]) return fail(`goto needs a URL — e.g. goto http://localhost:5173/ or goto /path`);
      let url;
      try { url = normalizeUrl(args.join(' ').trim(), await curUrl()); } catch (e) { return fail(`cannot open "${args[0]}": ${e.message} — give a full URL like http://localhost:5173/`); }
      const t0 = Date.now();
      S.docStatus = null;
      let r;
      try { r = await send('Page.navigate', { url }, 11000); }
      catch (e) { send('Page.stopLoading').catch(() => {}); return fail(`${url} did not answer within 11 s (${oneLine(e.message)}) — is the server running? check the URL and retry`); }
      if (r.errorText && r.errorText !== 'net::ERR_ABORTED') return fail(`could not load ${url}: ${r.errorText} — is the server running and the URL right?`);
      const s = await settle(8000, 150);
      const bad = S.docStatus >= 400 ? ` — the server answered ${S.docStatus}` : '';
      const now = await curUrl();
      return afterAction(`OK loaded ${url} in ${Date.now() - t0} ms${bad}${now !== url && now.replace(/\/$/, '') !== url.replace(/\/$/, '') ? ` → redirected to ${shortUrl(now)}` : ''}${settleNote(s)}`, flags);
    },
    async back(args, flags) {
      const h = await send('Page.getNavigationHistory');
      const prev = h.entries[h.currentIndex - 1];
      if (!prev || prev.url === 'about:blank') return fail('there is no earlier page in this session’s history — use goto <url>');
      const before = await curUrl();
      await send('Page.navigateToHistoryEntry', { entryId: prev.id });
      const s = await settle(8000, 200);
      return afterAction(`OK went back${navNote(before, await curUrl())}${settleNote(s)}`, flags);
    },
    async reload(args, flags) {
      const url = S.url;
      let how = '';
      try { await send('Page.reload', {}, 4000); }
      catch (e) { // frozen or crashed tab: stop its script, open a fresh tab on the same address
        await cdp.send('Runtime.terminateExecution', {}, sid, 1000).catch(() => {});
        await freshTab();
        if (/^https?:/.test(url)) await send('Page.navigate', { url }, 8000).catch(() => {});
        how = ' in a fresh tab, because the old one did not respond (storage and cookies kept; unsaved page state lost)';
      }
      const s = await settle(10000, 250);
      return afterAction(`OK reloaded ${shortUrl(await curUrl())}${how}${settleNote(s)}`, flags);
    },
    async look(args, flags) {
      const body = render(await doLook(flags.all));
      S.lastLines = body;
      return ['OK look', ...body];
    },
    async click(args, flags) {
      const raw = args.join(' ').trim();
      if (!raw) return fail('click needs a target — a number from look, "visible text", css=SELECTOR or xy=X,Y');
      const before = await curUrl(), mark = await domMark();
      let desc, x, y, extra = '';
      const xy = /^xy=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(raw);
      if (xy) {
        x = +xy[1]; y = +xy[2];
        if (x >= S.vp.w || y >= S.vp.h) return fail(`xy=${x},${y} is outside the ${S.vp.w}x${S.vp.h} viewport — coordinates are CSS pixels from the top-left of the visible area`);
        desc = `the point ${x},${y}`;
      } else {
        const r = await resolveTarget(raw, 'click');
        if (!r.ok) return r.lines;
        if (r.disabled && !flags.force) return fail(`${r.desc} is disabled — not clicked (a user cannot activate it either). Check what the form still needs; --force taps it anyway.`);
        const p = await pageCall('prepClick', { force: !!flags.force });
        if (p.error === 'covered') return fail(`${r.desc} is covered by ${p.by} — a tap would land on that instead, so nothing was clicked. Close or move what is on top (press Escape, scroll), or use --force.`);
        if (p.error) return fail(`${r.desc} cannot be clicked: ${p.error === 'gone' ? 'it disappeared' : p.error === 'nosize' ? 'it has no size on screen' : 'it could not be scrolled into view'} — run look and retry`);
        x = p.x; y = p.y; desc = r.desc;
        if (r.note) extra += ` (${r.note})`;
        if (p.forced) extra += ' (forced: tapped its centre although something covers it)';
      }
      extra += await tapOrClick(x, y);
      const s = await settle(5000, 120);
      return afterAction(`OK ${S.vp.touch ? 'tapped' : 'clicked'} ${desc}${extra}${navNote(before, await curUrl())}${settleNote(s)}`, flags, false, mark);
    },
    async type(args, flags) {
      if (args.length < 2) return fail('type needs a field and the text — e.g. type 3 "dana@example.com" or type "Email" "dana@example.com"  (use "" to clear)');
      const text = args.slice(1).join(' ');
      const r = await resolveTarget(args[0].trim(), 'type');
      if (!r.ok) return r.lines;
      if (r.disabled || r.readonly) return fail(`${r.desc} is ${r.disabled ? 'disabled' : 'read-only'} — nothing was typed (a user cannot edit it either)`);
      const p = await pageCall('prepType', { append: !!flags.append });
      if (p.error) return fail(`cannot type into ${r.desc}: ${p.error} — try click on it first, or close what is covering it`);
      const want = flags.append ? p.before + text : text;
      let v, how = '';
      if (p.mode === 'insert') {
        const ins = (p.prefix || '') + text;
        if (ins) await send('Input.insertText', { text: ins });
        v = await pageCall('fieldValue');
        if (ins && v.value === (p.prefix !== undefined || !flags.append ? '' : p.before)) { v = await pageCall('setValue', want); how = ' (set directly — keyboard input had no effect)'; }
      } else v = await pageCall('setValue', want);
      const s = await settle(2000, 100);
      v = await pageCall('fieldValue').catch(() => v);
      const shownVal = v.password ? `${v.value.length} characters (hidden)` : `"${cut(v.value, 80)}"`;
      const diff = v.value !== want ? ' — NOT what was typed: the app changed or rejected the input' : '';
      return afterAction(`OK typed into ${r.desc}${how} — it now holds ${shownVal}${diff}${settleNote(s)}`, flags);
    },
    async press(args, flags) {
      const k = args[0] ? parseKey(args[0]) : null;
      if (!k) return fail(`press needs a key — Enter, Tab, Escape, Backspace, Delete, Space, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, one character, or a combo like Shift+Tab${args[0] ? ` ("${args[0]}" is not one)` : ''}`);
      const times = Math.max(1, Math.min(30, parseInt(args[1], 10) || 1));
      const before = await curUrl(), mark = await domMark();
      for (let i = 0; i < times; i++) {
        const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: k.modifiers };
        await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      }
      const s = await settle(5000, 120);
      return afterAction(`OK pressed ${args[0]}${times > 1 ? ` x${times}` : ''}${navNote(before, await curUrl())}${settleNote(s)}`, flags, true, mark);
    },
    async select(args, flags) {
      if (args.length < 2) return fail('select needs a dropdown and an option — e.g. select 4 "Banana" or select "Fruit" "Banana"');
      const want = args.slice(1).join(' ');
      const r = await resolveTarget(args[0].trim(), 'select');
      if (!r.ok) return r.lines;
      if (r.disabled) return fail(`${r.desc} is disabled — nothing was selected`);
      const o = await pageCall('selectOption', want);
      if (o.error) return fail(`${r.desc} has ${o.error === 'ambiguous' ? 'several options' : o.error === 'disabled' ? 'only a disabled option' : 'no option'} matching "${want}" — options: ${o.options.map((x) => `"${x}"`).join(', ')}`);
      const s = await settle(3000, 100);
      return afterAction(`OK selected "${o.text}" in ${r.desc}${settleNote(s)}`, flags);
    },
    async scroll(args, flags) {
      const a = args.join(' ').trim(), dir = a.toLowerCase();
      if (!a) return fail('scroll needs a direction or text — down, up, top, bottom, or "some visible text"');
      let first;
      if (['down', 'up', 'top', 'bottom'].includes(dir)) {
        const r = await pageCall('scroll', { dir });
        if (r.none) first = 'OK nothing to scroll — the whole page fits in the viewport';
        else if (r.to === r.from) first = `OK already at the ${dir === 'down' || dir === 'bottom' ? 'bottom' : 'top'} (${r.to}/${r.max}px) — did not move`;
        else first = `OK scrolled ${r.to > r.from ? 'down' : 'up'} ${Math.abs(r.to - r.from)}px — now ${r.to}/${r.max}px${r.inner ? ` inside ${r.inner}` : ''}`;
      } else {
        const text = a.startsWith('text=') ? a.slice(5) : a;
        const r = await pageCall('scroll', { text });
        if (r.error) return fail(`no visible text matches "${text}" — run look --all to see all the text on the page`);
        first = `OK scrolled to "${cut(text, 60)}"${r.n > 1 ? ` (first of ${r.n} matches)` : ''}`;
      }
      const s = await settle(2500, 100);
      return afterAction(first + settleNote(s), flags);
    },
    async shot(args, flags) {
      const name = (args[0] || '').replace(/\.png$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      const file = path.join(shotsDir, `${String(++S.shotN).padStart(3, '0')}${name ? '-' + name : ''}.png`);
      const m = await send('Page.getLayoutMetrics');
      const vv = m.cssVisualViewport, size = m.cssContentSize, scale = flags.x1 ? 1 / S.vp.dpr : 1;
      const params = { format: 'png' };
      let note = '';
      if (flags.full) {
        const H = Math.min(Math.ceil(size.height), 12000);
        params.captureBeyondViewport = true;
        params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: H, scale };
        if (size.height > H) note = `; the page is ${Math.round(size.height)}px tall, cut at ${H}px`;
        else if (size.height <= vv.clientHeight + 2) note = '; the document is no taller than the viewport — if it scrolls inside a container, scroll and take viewport shots instead';
      } else if (scale !== 1) params.clip = { x: vv.pageX, y: vv.pageY, width: vv.clientWidth, height: vv.clientHeight, scale };
      const r = await send('Page.captureScreenshot', params, 15000);
      const buf = Buffer.from(r.data, 'base64');
      fs.writeFileSync(file, buf);
      return [`OK shot ${file} (${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)} px, ${flags.full ? 'full page' : 'viewport'} of ${vpText(S.vp)}${note})`];
    },
    async viewport(args, flags) {
      const a = (args[0] || '').toLowerCase(), m = /^(\d{2,5})x(\d{2,5})$/.exec(a);
      let v;
      if (PRESETS[a]) v = { name: a, ...PRESETS[a] };
      else if (m) v = { ...S.vp, name: 'custom', w: +m[1], h: +m[2] };
      else return fail('viewport needs phone, small, desktop or WxH (e.g. viewport 768x1024 — keeps the current touch/mouse mode)');
      const uaChange = v.mobile !== S.vp.mobile;
      await applyViewport(v);
      const s = await settle(2500, 250);
      return afterAction(`OK viewport is now ${vpText(v)} — same page, not reloaded${uaChange ? '; the new user agent applies from the next page load' : ''}${settleNote(s)}`, flags);
    },
    async wait(args, flags) {
      const a = args.join(' ').trim();
      if (!a) return fail('wait needs milliseconds or text — e.g. wait 800 or wait "Saved"');
      if (/^\d+$/.test(a)) {
        const ms = Math.min(+a, 15000);
        await sleep(ms);
        return afterAction(`OK waited ${ms} ms`, flags);
      }
      const text = a.startsWith('text=') ? a.slice(5) : a;
      const limit = Math.max(200, Math.min(Number(flags.timeout) || 10000, 15000));
      const t0 = Date.now();
      while (Date.now() - t0 < limit) {
        let ok = false;
        try { ok = await pageCall('hasText', text, 3000); } catch {}
        if (ok) { const took = Date.now() - t0; await settle(1500, 60); return afterAction(`OK "${cut(text, 60)}" is on the page (after ${took} ms)`, flags); }
        await sleep(100);
      }
      return afterAction(`ERROR "${cut(text, 60)}" did not appear within ${limit / 1000} s — the current page follows; check for an error message or a different wording`, flags);
    },
    async dialog(args) {
      const a = (args[0] || '').toLowerCase();
      if (!a) return [`OK dialogs are ${S.policy === 'accept' ? 'accepted (OK)' : 'dismissed (Cancel)'} automatically${S.promptText != null ? `; prompts are answered "${S.promptText}"` : ''} — change with: dialog accept|dismiss`];
      if (a !== 'accept' && a !== 'dismiss') return fail('dialog takes accept or dismiss (optionally followed by the text to answer prompts with)');
      S.policy = a;
      S.promptText = args.length > 1 ? args.slice(1).join(' ') : null;
      return [`OK from now on confirm/prompt dialogs are ${a === 'accept' ? 'accepted (OK)' : 'dismissed (Cancel)'}${S.promptText != null ? `, prompts answered "${S.promptText}"` : ''}; alerts are always closed. Each one is reported when it appears.`];
    },
    async storage(args, flags) {
      const st = await pageCall('storage');
      const { cookies } = await send('Network.getCookies', {});
      const val = (v) => (flags.all ? v : cut(v, 200));
      const L = [`OK storage for ${st.origin}`];
      for (const [name, list] of [['localStorage', st.local], ['sessionStorage', st.session]]) {
        L.push(list ? `${name} ${list.length}` : `${name} not available on this page`);
        for (const [k, v] of list || []) L.push(`  ${k} = ${val(v)}`);
      }
      L.push(`cookies ${cookies.length}`);
      for (const c of cookies) L.push(`  ${c.name} = ${val(c.value)}  (${c.domain}${c.path}; ${c.expires > 0 ? 'expires ' + new Date(c.expires * 1000).toISOString().slice(0, 16).replace('T', ' ') : 'session'}${c.httpOnly ? '; httpOnly' : ''}${c.secure ? '; secure' : ''}${c.sameSite ? '; sameSite=' + c.sameSite : ''})`);
      return L;
    },
    async eval(args, flags) {
      const expression = args.join(' ');
      if (!expression.trim()) return fail('eval needs JavaScript — e.g. eval document.title   or   eval "[...document.querySelectorAll(\'h2\')].map(h => h.innerText)"');
      // replMode: statements, top-level await and re-declaring let/const all work, like in the DevTools console
      let v;
      try {
        const r = await send('Runtime.evaluate', { expression, userGesture: true, replMode: true }, 10000);
        if (r.exceptionDetails) return fail(`eval threw: ${cut(oneLine(r.exceptionDetails.exception?.description || r.exceptionDetails.text), 400)}`);
        v = r.result;
        if (v.subtype === 'promise') {
          const a = await send('Runtime.awaitPromise', { promiseObjectId: v.objectId, returnByValue: true }, 10000);
          if (a.exceptionDetails) return fail(`eval: the promise rejected: ${cut(oneLine(a.exceptionDetails.exception?.description || a.exceptionDetails.text), 400)}`);
          v = a.result;
        } else if (v.subtype === 'node') v = { type: 'object', subtype: 'node', value: `${v.description} (a DOM node — return a string instead, e.g. its .outerHTML or .innerText)` };
        else if (v.objectId) v = (await send('Runtime.callFunctionOn', { objectId: v.objectId, functionDeclaration: 'function () { return this; }', returnByValue: true }, 10000)).result;
      } catch (e) { send('Runtime.terminateExecution').catch(() => {}); return fail(`eval did not finish: ${oneLine(e.message)} — the script may never return, or its result cannot be turned into JSON; simplify it`); }
      let out = v.type === 'undefined' ? 'undefined' : v.value !== undefined ? JSON.stringify(v.value, null, 1) : v.unserializableValue || v.description || String(v.value);
      if (out.length < 200) out = out.replace(/\n\s*/g, ' ');
      return [`OK eval → ${v.subtype || v.type}`, flags.all ? out : cut(out, 6000)];
    },
    async errors(args, flags) {
      const all = S.events;
      const by = {};
      for (const e of all) by[e.kind] = (by[e.kind] || 0) + 1;
      const L = [all.length ? `OK ${all.length} recorded since start: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}` : 'OK nothing recorded since start — no console errors, exceptions, failed requests or dialogs'];
      const list = flags.all ? all : all.slice(-60);
      if (list.length < all.length) L.push(`(showing the last ${list.length}; errors --all shows everything)`);
      for (const e of list) {
        const sec = Math.round((e.t - S.startedAt) / 1000);
        L.push(`#${e.n} +${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} ${e.kind} ${e.text}  [on ${shortUrl(e.at)}]`);
      }
      S.reported = S.seq;
      if (flags.clear) { S.events = []; L.push('(cleared)'); }
      return L;
    },
  };

  // new console errors, failed requests and dialogs since the previous command's output
  const eventsTail = () => {
    const fresh = S.events.filter((e) => e.n > S.reported);
    S.reported = S.seq;
    if (!fresh.length) return [];
    const groups = new Map();
    for (const e of fresh) { const k = e.kind + ' ' + e.text; groups.set(k, (groups.get(k) || 0) + 1); }
    const L = ['EVENTS since the last command'];
    let n = 0;
    for (const [k, c] of groups) { if (++n > 12) { L.push(`! … +${groups.size - 12} more — run errors`); break; } L.push(`! ${k}${c > 1 ? ` (x${c})` : ''}`); }
    return L;
  };

  let chain = Promise.resolve();
  const execute = async (cmd, args, flags) => {
    S.lastCmdAt = Date.now();
    const epoch = ++S.epoch;
    const h = handlers[cmd];
    let lines, timer;
    if (!h) lines = [`ERROR unknown command "${cmd}" — commands: ${COMMANDS.join(' ')}`];
    else {
      try {
        lines = await Promise.race([
          als.run({ epoch, deadline: Date.now() + CMD_DEADLINE }, () => h(args, flags)),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('__deadline')), CMD_DEADLINE); }),
        ]);
      } catch (e) {
        if (e.message === '__deadline') { S.epoch++; lines = [`ERROR ${cmd} did not finish within ${CMD_DEADLINE / 1000} s and was abandoned — the page may be stuck or very slow. Try: look, then reload; if that fails: stop and start.`]; }
        else if (cdp.closed) lines = [`ERROR the browser is gone — restart with: ${CLI} ${session} start`];
        else if (/got no answer within/.test(e.message)) {
          cdp.send('Runtime.terminateExecution', {}, sid, 1500).catch(() => {}); // a script that never returns blocks the page: stop it
          lines = [`ERROR ${cmd} failed: the page did not respond (${cut(oneLine(e.message), 120)}) — a script on the page seems stuck and was told to stop. Run look; if the page is still frozen, run reload.`];
        } else lines = [`ERROR ${cmd} failed: ${cut(oneLine(e.message), 300)} — the session is still usable; try look, or reload if the page seems stuck`];
        log(`${cmd} threw: ${e.stack || e}`);
      } finally { clearTimeout(timer); }
    }
    await sleep(0);
    const all = cmd === 'stop' ? lines : [...lines, ...eventsTail()];
    log(`${cmd} ${cut(args.join(' '), 120)} → ${cut(all[0], 160)}`);
    return { ok: !all[0].startsWith('ERROR'), out: all.join('\n') };
  };

  const shutdown = async (why) => {
    if (quitting) return;
    quitting = true;
    log('stopping: ' + why);
    try { fs.rmSync(sessionFile(sdir), { force: true }); } catch {}
    try { await cdp.send('Browser.close', {}, null, 1500); } catch {}
    for (let i = 0; i < 40 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(50);
    try { chrome.kill('SIGKILL'); } catch {}
    process.exit(0);
  };
  cdp.onclose = () => shutdown('browser connection closed');
  for (const sgn of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sgn, () => shutdown(sgn));
  setInterval(() => { if (Date.now() - S.lastCmdAt > IDLE_MS) shutdown('idle for too long'); }, 30000).unref();

  const token = crypto.randomBytes(16).toString('hex');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on('end', async () => {
      let out, cmd = '';
      try {
        if (req.method !== 'POST' || req.headers['x-browse-token'] !== token) { res.writeHead(403); res.end('{}'); return; }
        const q = JSON.parse(body);
        cmd = String(q.cmd);
        const job = chain.then(() => execute(cmd, (q.args || []).map(String), q.flags || {}));
        chain = job.catch(() => {});
        out = await job;
      } catch (e) { out = { ok: false, out: 'ERROR bad request to the browser daemon: ' + oneLine(e.message) }; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out), () => { if (cmd === 'stop') shutdown('stop command'); });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const info = { session, pid: process.pid, port: server.address().port, token, chromePid: chrome.pid, preset, startedAt: new Date().toISOString() };
    fs.writeFileSync(sessionFile(sdir) + '.tmp', JSON.stringify(info));
    fs.renameSync(sessionFile(sdir) + '.tmp', sessionFile(sdir));
    log(`ready: ${session} ${vpText(S.vp)} port ${info.port} chrome ${chrome.pid}`);
  });
}

// ───────────────────────────── selftest ─────────────────────────────
const TEST_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Browse selftest</title><link rel="icon" href="data:,">
<style>
body{font:16px system-ui,sans-serif;margin:0;padding:12px 12px 90px} button,input,select{font:inherit;padding:8px;margin:2px 0}
.row{display:flex;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd;padding:4px 0}
nav.bottom{position:fixed;left:0;right:0;bottom:0;height:64px;background:#eef;display:flex;justify-content:space-around;align-items:center;border-top:1px solid #99a}
.box{height:120px;overflow:auto;border:1px solid #999} .box button{display:block}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)} .card{cursor:pointer;border:1px solid #999;padding:10px;margin:6px 0}
#modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none} #modal .panel{position:absolute;left:8%;right:8%;top:20%;background:#fff;padding:16px}
.shade{position:absolute;inset:0} .wrap{position:relative;display:inline-block}
</style></head><body><div id="app"></div>
<nav class="bottom"><a href="/" data-spa>Home tab</a><a href="/page2" data-spa>Two tab</a></nav>
<div id="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="panel"><h2 id="mt">Test dialog</h2><p>Dialog body text.</p><button id="closeModal">Close dialog</button></div></div>
<script>
var state = { name: '', taps: 0 };
function $(id) { return document.getElementById(id); }
function home() {
  var h = '<h1>Selftest home</h1><p>A page for testing the browser driver.</p>';
  h += '<button id="btn">Tap me</button> <span id="tapOut">Not tapped</span>';
  h += '<form id="f"><label for="name">Your name</label> <input id="name" placeholder="Type a name"> <p id="mirror">Hello, nobody</p>';
  h += '<input id="email" type="email" placeholder="Email address"> <label for="qty">Quantity</label> <input id="qty" type="number" value="1">';
  h += '<label for="day">Day</label> <input id="day" type="date"> <button type="submit">Send form</button></form><p id="formOut">Not submitted</p>';
  h += '<label for="fruit">Fruit</label> <select id="fruit"><option value="apple">Apple</option><option value="banana">Banana</option><option value="cherry">Cherry</option></select> <span id="fruitOut">Fruit: apple</span>';
  h += '<p><label><input type="checkbox" id="agree"> Agree to terms</label> <span id="agreeOut">Agreed: no</span></p>';
  h += '<p><input type="checkbox" id="hid" class="sr"><label for="hid" id="hidLabel">Fancy toggle</label> <span id="hidOut">Fancy: off</span></p>';
  h += '<button id="sw" role="switch" aria-checked="false">Notifications</button>';
  h += '<p><button id="conf">Ask confirm</button> <span id="confOut">Confirm result: none</span></p>';
  h += '<p><button id="late">Show late</button> <button id="miss">Load missing</button> <span id="missOut">Fetch: idle</span></p>';
  h += '<p><button id="logerr">Log error</button> <button id="throw">Throw</button> <button id="dis" disabled>Disabled action</button></p>';
  h += '<p><button id="seven">7</button> <span id="numOut">Number: none</span> <button id="paint">Paint</button> <button id="freeze">Freeze</button></p>';
  h += '<div class="row"><span>Row A</span><button class="del" data-row="A">Delete</button></div><div class="row"><span>Row B</span><button class="del" data-row="B">Delete</button></div><p id="delOut">Deleted: none</p>';
  h += '<button id="openModal">Open dialog</button> <button id="gear" aria-label="Settings"><svg width="16" height="16"><circle cx="8" cy="8" r="6"/></svg></button>';
  h += '<div class="card" id="card">Plain clickable card</div><p id="cardOut">Card: idle</p>';
  h += '<div class="wrap"><button id="under">Covered button</button><div class="shade"></div></div>';
  h += '<p><a href="/other.html">Other page</a> · <a href="/page2" data-spa>Go to page two</a> · <a href="/other.html" target="_blank">Opens new tab</a></p>';
  h += '<div class="box" id="box">'; for (var i = 1; i <= 50; i++) h += '<button class="inner" data-n="' + i + '">Inner item ' + i + '</button>'; h += '</div><p id="innerOut">Inner: none</p>';
  for (var j = 1; j <= 40; j++) h += '<h3>Section ' + j + '</h3><p>Paragraph text for section number ' + j + ' of the long page.</p>';
  h += '<button id="bottom">Bottom button</button> <span id="bottomOut">Bottom: idle</span>';
  $('app').innerHTML = h;
  var inp = $('name');
  inp.value = state.name;
  // a controlled input, React-style: only "input" events change state; anything else is reverted
  inp.addEventListener('input', function (e) { state.name = e.target.value; $('mirror').textContent = 'Hello, ' + (state.name || 'nobody'); });
  $('f').addEventListener('submit', function (e) { e.preventDefault(); $('formOut').textContent = 'Submitted: ' + state.name + ' / ' + $('email').value + ' / ' + $('qty').value + ' / ' + $('day').value; });
  $('fruit').addEventListener('change', function (e) { $('fruitOut').textContent = 'Fruit: ' + e.target.value; });
  $('agree').addEventListener('change', function (e) { $('agreeOut').textContent = 'Agreed: ' + (e.target.checked ? 'yes' : 'no'); });
  $('hid').addEventListener('change', function (e) { $('hidOut').textContent = 'Fancy: ' + (e.target.checked ? 'on' : 'off'); });
}
setInterval(function () { var inp = $('name'); if (inp && inp.value !== state.name) inp.value = state.name; }, 30);
function render() {
  if (location.pathname === '/page2') $('app').innerHTML = '<h1>Page two</h1><p>You are on the second page.</p><a href="/" data-spa>Back home</a>';
  else home();
}
document.addEventListener('click', function (e) {
  var t = e.target, a = t.closest('a[data-spa]');
  if (a) { e.preventDefault(); history.pushState({}, '', a.getAttribute('href')); render(); return; }
  if (t.id === 'btn') { state.taps++; $('tapOut').textContent = 'Tapped ' + state.taps + ' via ' + (e.pointerType || 'unknown'); }
  if (t.id === 'sw') t.setAttribute('aria-checked', t.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
  if (t.id === 'conf') $('confOut').textContent = 'Confirm result: ' + confirm('Really delete?');
  if (t.id === 'late') setTimeout(function () { var p = document.createElement('p'); p.textContent = 'Late content arrived'; t.after(p); }, 500);
  if (t.id === 'miss') fetch('/missing-data').then(function (r) { $('missOut').textContent = 'Fetch: ' + r.status; });
  if (t.id === 'logerr') console.error('selftest console error');
  if (t.id === 'seven') $('numOut').textContent = 'Number: 7';
  if (t.id === 'paint') t.classList.toggle('on');
  if (t.id === 'freeze') for (;;) {}
  if (t.id === 'throw') setTimeout(function () { throw new Error('selftest exception'); }, 0);
  if (t.classList.contains('del')) $('delOut').textContent = 'Deleted: ' + t.dataset.row;
  if (t.id === 'openModal') $('modal').style.display = 'block';
  if (t.id === 'closeModal') $('modal').style.display = 'none';
  if (t.id === 'card') $('cardOut').textContent = 'Card: clicked';
  if (t.id === 'under') t.textContent = 'Covered was clicked';
  if (t.classList.contains('inner')) $('innerOut').textContent = 'Inner: ' + t.dataset.n;
  if (t.id === 'bottom') $('bottomOut').textContent = 'Bottom: clicked';
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('modal').style.display = 'none'; });
window.addEventListener('popstate', render);
localStorage.setItem('selftest-key', 'stored-' + innerWidth);
document.cookie = 'selftest_cookie=yes; path=/';
render();
</script></body></html>`;
const OTHER_PAGE = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Other page</title><link rel="icon" href="data:,"></head><body><h1>Other page</h1><p>A separate document.</p><a href="/">Home link</a></body></html>';

async function selftest(parent) {
  const base = path.join(parent, `_selftest-${process.pid}`); // its own base dir: never touches other sessions
  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (p === '/' || p === '/page2') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(TEST_PAGE); }
    else if (p === '/other.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(OTHER_PAGE); }
    else { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"nothing here"}'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const tag = 't';
  const results = [];
  const run = (session, ...args) => new Promise((resolve) => {
    const t0 = Date.now();
    execFile(process.execPath, [SELF, session, ...args, '--dir', base], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 }, (err, stdout) => {
      resolve({ out: stdout || '', code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, ms: Date.now() - t0 });
    });
  });
  const suite = async (preset) => {
    const s = `${tag}-${preset}`, P = PRESETS[preset], touch = P.touch;
    const out = [];
    const check = (name, ok, detail) => { out.push({ name: `${preset}: ${name}`, ok: !!ok, detail: ok ? '' : cut(oneLine(detail ?? ''), 300) }); return !!ok; };
    const idx = (text, kindLabel) => { const m = new RegExp(`^\\[(\\d+)\\] ${kindLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').exec(text); return m ? m[1] : null; };
    let r = await run(s, 'start', preset, origin + '/');
    check('start opens the page', r.code === 0 && /^OK started/.test(r.out) && r.out.includes('TITLE Browse selftest') && r.out.includes(`VIEW ${preset} ${P.w}x${P.h}`), r.out);
    r = await run(s, 'look');
    check('look: heading, numbered controls, states', /^OK look/.test(r.out) && r.out.includes('# Selftest home') && /\[\d+\] button "Tap me"/.test(r.out) && /button "Disabled action" disabled/.test(r.out) && /input "Your name" empty placeholder="Type a name"/.test(r.out) && /select "Fruit" = "Apple"/.test(r.out) && /checkbox "Agree to terms" unchecked/.test(r.out) && /switch "Notifications" off/.test(r.out) && /button "Settings"/.test(r.out) && /clickable "Plain clickable card"/.test(r.out), r.out);
    check('look: fold marker and fixed bottom nav in view', r.out.includes('-- below the fold — scroll down --') && r.out.indexOf('link "Home tab"') < r.out.indexOf('-- below the fold') && r.out.indexOf('link "Go to page two"') > r.out.indexOf('-- below the fold') && /more controls not listed/.test(r.out), r.out);
    check('look: row text merged, new-tab link marked', /Row A \| \[\d+\] Delete/.test(r.out) && /link "Opens new tab" → \/other\.html \(new tab\)/.test(r.out), r.out);
    const tapIdx = idx(r.out, 'button "Tap me"');
    r = await run(s, 'click', tapIdx);
    check(`click by number uses real ${touch ? 'touch' : 'mouse'} input`, r.code === 0 && r.out.includes(`Tapped 1 via ${touch ? 'touch' : 'mouse'}`), r.out);
    r = await run(s, 'click', 'css=#btn');
    check('click css= — a small change prints only the changed lines', r.code === 0 && r.out.includes('CHANGED — only these lines') && /^~ .*Tapped 2 via/m.test(r.out) && !r.out.includes('ELEMENTS'), r.out);
    r = await run(s, 'click', 'css=#btn', '--look');
    check('--look prints the full listing', r.code === 0 && r.out.includes('Tapped 3 via') && r.out.includes('ELEMENTS'), r.out);
    r = await run(s, 'click', 'tap me');
    check('click by text (case-insensitive)', r.code === 0 && r.out.includes('Tapped 4 via'), r.out);
    r = await run(s, 'click', 'text=7');
    check('click text=7 clicks the button labelled 7, not element [7]', r.code === 0 && /button "7"/.test(r.out.split('\n')[0]) && r.out.includes('Number: 7'), r.out);
    r = await run(s, 'click', 'Paint');
    check('a style-only change is pointed out', r.code === 0 && r.out.includes('LISTING unchanged, but the page itself changed'), r.out);
    r = await run(s, 'click', 'Plain clickable card');
    check('click a non-semantic clickable', r.code === 0 && r.out.includes('Card: clicked'), r.out);
    r = await run(s, 'click', 'Agree to terms');
    check('click a checkbox by its label', r.code === 0 && r.out.includes('Agreed: yes') && /checkbox "Agree to terms" checked/.test(r.out), r.out);
    r = await run(s, 'click', 'Fancy toggle');
    check('click a label standing in for a hidden checkbox', r.code === 0 && r.out.includes('Fancy: on'), r.out);
    r = await run(s, 'click', 'Notifications');
    check('switch state changes', r.code === 0 && /switch "Notifications" on/.test(r.out), r.out);
    r = await run(s, 'type', 'Your name', 'Dana');
    check('type by label updates a controlled input', r.code === 0 && r.out.includes('it now holds "Dana"') && /input "Your name" value="Dana"/.test(r.out), r.out);
    r = await run(s, 'look');
    check('controlled input kept the value and fired events', r.out.includes('Hello, Dana') && /input "Your name" value="Dana"/.test(r.out), r.out);
    r = await run(s, 'type', 'Your name', ' Cohen', '--append');
    check('type --append', r.code === 0 && r.out.includes('it now holds "Dana Cohen"'), r.out);
    r = await run(s, 'type', 'Email address', 'dana@example.com');
    check('type by placeholder (email field)', r.code === 0 && r.out.includes('it now holds "dana@example.com"') && /^~ \[\d+\] input:email .*value="dana@example\.com"/m.test(r.out) && !r.out.includes('ELEMENTS'), r.out);
    r = await run(s, 'type', 'css=#qty', '7');
    check('type css= into a number field (replaces the old value)', r.code === 0 && r.out.includes('it now holds "7"'), r.out);
    r = await run(s, 'type', 'css=#qty', '5', '--append');
    check('type --append into a number field', r.code === 0 && r.out.includes('it now holds "75"'), r.out);
    r = await run(s, 'type', 'Day', '2026-03-09');
    check('type into a date field', r.code === 0 && r.out.includes('it now holds "2026-03-09"'), r.out);
    r = await run(s, 'look');
    const nameIdx = idx(r.out, 'input "Your name"');
    r = await run(s, 'type', nameIdx, 'Noa');
    check('type by number (replaces)', r.code === 0 && r.out.includes('it now holds "Noa"'), r.out);
    r = await run(s, 'press', 'Backspace');
    r = await run(s, 'look');
    check('press Backspace edits the focused field', /input "Your name" value="No" .*focused/.test(r.out) && r.out.includes('Hello, No'), r.out);
    r = await run(s, 'press', 'Tab');
    check('press Tab moves focus', r.code === 0 && /FOCUS is on \[\d+\] input:email/.test(r.out), r.out);
    r = await run(s, 'press', 'Enter');
    check('press Enter submits the form', r.code === 0 && r.out.includes('Submitted: No / dana@example.com / 75 / 2026-03-09'), r.out);
    r = await run(s, 'select', 'Fruit', 'Banana');
    check('select by label', r.code === 0 && r.out.includes('OK selected "Banana"') && /select "Fruit" = "Banana"/.test(r.out), r.out);
    r = await run(s, 'look');
    check('select fired change', r.out.includes('Fruit: banana'), r.out);
    r = await run(s, 'select', idx(r.out, 'select "Fruit"'), 'cherry');
    check('select by number', r.code === 0 && r.out.includes('OK selected "Cherry"'), r.out);
    r = await run(s, 'select', 'Fruit', 'Mango');
    check('select: unknown option lists the options', r.code === 1 && /^ERROR/.test(r.out) && r.out.includes('"Apple", "Banana", "Cherry"'), r.out);
    r = await run(s, 'click', 'Ask confirm');
    check('confirm() accepted by default and reported', r.code === 0 && r.out.includes('Confirm result: true') && r.out.includes('! dialog confirm "Really delete?" → accepted (OK)'), r.out);
    r = await run(s, 'dialog', 'dismiss');
    check('dialog dismiss', r.code === 0 && /^OK/.test(r.out), r.out);
    r = await run(s, 'click', 'Ask confirm');
    check('confirm() dismissed and reported', r.code === 0 && r.out.includes('Confirm result: false') && r.out.includes('→ dismissed (Cancel)'), r.out);
    await run(s, 'dialog', 'accept');
    r = await run(s, 'click', 'Show late');
    const r2 = await run(s, 'wait', 'Late content arrived');
    check('wait "text" sees content that appears later', !r.out.includes('Late content arrived') && r2.code === 0 && /^OK "Late content arrived" is on the page/.test(r2.out), r.out + ' /// ' + r2.out);
    r = await run(s, 'wait', '300');
    check('wait <ms>', r.code === 0 && /^OK waited 300 ms/.test(r.out) && r.out.includes('PAGE unchanged'), r.out);
    r = await run(s, 'wait', 'never-there-text', '--timeout', '1200');
    check('wait "text" times out with an error', r.code === 1 && /^ERROR "never-there-text" did not appear/.test(r.out) && r.ms < 8000, r.out);
    r = await run(s, 'click', 'Load missing');
    check('a 404 fetch is reported with its body', r.code === 0 && r.out.includes('Fetch: 404') && /! http 404 GET \/missing-data — \{"error":"nothing here"\}/.test(r.out), r.out);
    r = await run(s, 'click', 'Log error');
    check('console.error is reported', r.out.includes('! console.error selftest console error'), r.out);
    r = await run(s, 'click', 'Throw');
    check('uncaught exception is reported', /! exception Error: selftest exception/.test(r.out), r.out);
    r = await run(s, 'errors');
    check('errors lists everything so far', r.code === 0 && /^OK \d+ recorded/.test(r.out) && r.out.includes('http 404 GET /missing-data') && r.out.includes('console.error selftest console error') && r.out.includes('exception Error: selftest exception') && r.out.includes('dialog confirm'), r.out);
    r = await run(s, 'click', 'Disabled action');
    check('disabled button is refused', r.code === 1 && /^ERROR .*button "Disabled action" is disabled — not clicked/.test(r.out), r.out);
    r = await run(s, 'click', 'Delete');
    check('ambiguous text lists candidates', r.code === 1 && /^ERROR "Delete" matches 2 elements/.test(r.out) && /\[\d+\] button "Delete".*Row A/.test(r.out) && /\[\d+\] button "Delete".*Row B/.test(r.out), r.out);
    const second = [...r.out.matchAll(/^\[(\d+)\] button "Delete"/gm)].map((m) => m[1])[1];
    r = await run(s, 'click', second);
    check('candidate number then works', r.code === 0 && r.out.includes('Deleted: B'), r.out);
    r = await run(s, 'click', 'No such thing');
    check('unknown target is an error, daemon stays usable', r.code === 1 && /^ERROR no visible element matches/.test(r.out), r.out);
    r = await run(s, 'click', 'Covered button');
    check('covered element is refused with the reason', r.code === 1 && /^ERROR .*is covered by <div\.shade>/.test(r.out), r.out);
    r = await run(s, 'click', 'Covered button', '--force');
    check('--force taps anyway (lands on the cover)', r.code === 0 && r.out.includes('forced') && !r.out.includes('Covered was clicked'), r.out);
    r = await run(s, 'click', 'Freeze');
    const fr = await run(s, 'look');
    check('a script that never returns is stopped; the session survives', r.code === 1 && /^ERROR click failed: the page did not respond/.test(r.out) && r.ms < 15000 && fr.code === 0 && fr.out.includes('button "Freeze"'), r.out + ' /// ' + fr.out.slice(0, 80));
    r = await run(s, 'click', 'Open dialog');
    check('open dialog is called out; page controls hidden', r.code === 0 && r.out.includes('OVERLAY dialog "Test dialog" is open — the page behind it is blocked') && /\[1\] button "Close dialog"/.test(r.out) && !r.out.includes('button "Tap me"') && r.out.includes('## Test dialog') && /behind the overlay are not listed/.test(r.out), r.out);
    r = await run(s, 'click', 'Tap me');
    check('control behind a dialog is refused', r.code === 1 && /behind the open overlay/.test(r.out), r.out);
    r = await run(s, 'press', 'Escape');
    check('press Escape closes the dialog', r.code === 0 && !r.out.includes('OVERLAY') && r.out.includes('button "Open dialog"'), r.out);
    r = await run(s, 'click', 'Inner item 40');
    check('click inside a scroll container (off-screen in it)', r.code === 0 && r.out.includes('Inner: 40'), r.out);
    r = await run(s, 'scroll', 'top');
    r = await run(s, 'scroll', 'down');
    check('scroll down', r.code === 0 && /^OK scrolled down \d+px — now \d+\/\d+px/.test(r.out) && /VIEW .* scrolled [1-9]\d*\//.test(r.out), r.out);
    r = await run(s, 'scroll', 'up');
    check('scroll up', r.code === 0 && /^OK scrolled up \d+px — now 0\//.test(r.out), r.out);
    r = await run(s, 'scroll', 'bottom');
    check('scroll bottom', r.code === 0 && /\(at the bottom\)/.test(r.out) && /-- above the viewport — scroll up --/.test(r.out), r.out);
    r = await run(s, 'scroll', 'Section 20');
    check('scroll "text"', r.code === 0 && /^OK scrolled to "Section 20"/.test(r.out) && /### Section 20/.test((r.out.split('\nTEXT\n')[1] || '').split('-- below the fold')[0]), r.out);
    r = await run(s, 'scroll', 'top');
    check('scroll top', r.code === 0 && /scrolled 0\//.test(r.out), r.out);
    r = await run(s, 'click', 'Bottom button');
    check('click an off-screen target above a fixed bar (auto-scroll)', r.code === 0 && r.out.includes('Bottom: clicked'), r.out);
    r = await run(s, 'shot', 'view');
    const m1 = /^OK shot (\/.+\.png) \((\d+)x(\d+) px/.exec(r.out);
    check('shot saves a viewport PNG at device pixels', m1 && fs.existsSync(m1[1]) && fs.readFileSync(m1[1]).subarray(1, 4).toString() === 'PNG' && +m1[2] === P.w * P.dpr && +m1[3] === P.h * P.dpr, r.out);
    r = await run(s, 'shot', 'full', '--full');
    const m2 = /^OK shot (\/.+\.png) \((\d+)x(\d+) px, full page/.exec(r.out);
    check('shot --full is taller than the viewport', m2 && fs.existsSync(m2[1]) && +m2[3] > P.h * P.dpr, r.out);
    r = await run(s, 'shot', '--1x');
    const m3 = /^OK shot (\/.+\.png) \((\d+)x(\d+) px/.exec(r.out);
    check('shot --1x is CSS-pixel sized', m3 && +m3[2] === P.w && +m3[3] === P.h, r.out);
    r = await run(s, 'storage');
    check('storage shows localStorage and cookies', r.code === 0 && r.out.includes(`selftest-key = stored-${P.w}`) && /selftest_cookie = yes/.test(r.out), r.out);
    r = await run(s, 'eval', '1 + 1');
    const r3 = await run(s, 'eval', '({ title: document.title, n: document.querySelectorAll("h3").length })');
    check('eval prints JSON', r.code === 0 && /^OK eval → number\n2$/.test(r.out.trim()) && r3.out.includes('"title": "Browse selftest"') && r3.out.includes('"n": 40'), r.out + r3.out);
    r = await run(s, 'eval', 'nope.nope');
    check('eval error is reported, not fatal', r.code === 1 && /^ERROR eval threw: ReferenceError/.test(r.out), r.out);
    // stale numbers
    r = await run(s, 'scroll', 'top');
    r = await run(s, 'look');
    const t2 = idx(r.out, 'button "Tap me"');
    await run(s, 'eval', 'var b = document.getElementById("btn"), c = b.cloneNode(true); b.replaceWith(c); 1', '-q');
    r = await run(s, 'click', t2);
    check('a re-rendered element is found again by its label', r.code === 0 && /matched again by label/.test(r.out) && /Tapped \d+ via/.test(r.out), r.out);
    r = await run(s, 'look');
    const t3 = idx(r.out, 'button "Tap me"');
    await run(s, 'eval', 'document.getElementById("btn").remove(); 1', '-q');
    r = await run(s, 'click', t3);
    check('a removed element says the page changed and re-lists', r.code === 1 && /^ERROR \[\d+\] is no longer on the page/.test(r.out) && r.out.includes('ELEMENTS'), r.out);
    r = await run(s, 'click', '999');
    check('out-of-range number is an error', r.code === 1 && /^ERROR there is no \[999\]/.test(r.out), r.out);
    // navigation
    r = await run(s, 'click', 'Go to page two');
    check('SPA link (pushState) changes URL and content', r.code === 0 && /→ now at \/page2/.test(r.out) && r.out.includes('# Page two') && r.out.includes(`URL ${origin}/page2`), r.out);
    r = await run(s, 'back');
    check('back returns through SPA history', r.code === 0 && /→ now at \/$/m.test(r.out.split('\n')[0]) && r.out.includes(`URL ${origin}/\n`) && r.out.includes('link "Go to page two"'), r.out);
    r = await run(s, 'click', 'Other page');
    check('normal link loads a new document', r.code === 0 && r.out.includes('TITLE Other page') && r.out.includes('# Other page'), r.out);
    r = await run(s, 'goto', '/page2');
    check('goto with a relative path', r.code === 0 && /^OK loaded .*\/page2/.test(r.out) && r.out.includes('# Page two'), r.out);
    r = await run(s, 'reload');
    check('reload (same page again → one-line "unchanged")', r.code === 0 && /^OK reloaded \/page2\nPAGE unchanged/.test(r.out), r.out);
    r = await run(s, 'goto', origin + '/nope');
    check('goto a 404 page says so', r.out.includes('the server answered 404'), r.out);
    r = await run(s, 'goto', 'http://127.0.0.1:9/');
    check('goto an unreachable server is an error', r.code === 1 && /^ERROR could not load/.test(r.out), r.out);
    r = await run(s, 'goto', origin + '/');
    r = await run(s, 'click', 'Opens new tab');
    await sleep(900);
    r = await run(s, 'look');
    check('a link that opens a new tab is reported', /! popup a new tab opened \(.*\/other\.html\)/.test(r.out) && r.out.includes('TITLE Browse selftest'), r.out);
    // viewport keeps the page
    await run(s, 'click', 'Tap me');
    r = await run(s, 'viewport', 'small');
    check('viewport small keeps page state', r.code === 0 && r.out.includes('VIEW small 320x568') && /Tapped 1 via/.test(r.out), r.out);
    r = await run(s, 'viewport', '800x600');
    check('viewport WxH', r.code === 0 && r.out.includes('VIEW custom 800x600') && /Tapped 1 via/.test(r.out), r.out);
    r = await run(s, 'viewport', preset);
    r = await run(s, 'click', 'xy=5,5', '-q');
    check('click xy= and -q (one line)', r.code === 0 && r.out.trim().split('\n').length === 1, r.out);
    r = await run(s, 'bogus');
    const r4 = await run(s, 'type', 'Your name');
    const r5 = await run(s, 'look');
    check('bad commands give errors and the session survives', r.code === 1 && /^ERROR unknown command/.test(r.out) && r4.code === 1 && /^ERROR type needs/.test(r4.out) && r5.code === 0, r.out + r4.out);
    // restart is idempotent, then stop leaves nothing behind
    r = await run(s, 'start', preset, origin + '/page2');
    const sdir = path.join(base, s);
    const mains = sessionProcs(sdir).filter((p) => p.cmd.includes('--remote-debugging-port') && !p.cmd.includes('--type='));
    check('start again replaces the old browser', r.code === 0 && r.out.includes('# Page two') && mains.length === 1, r.out + ' mains=' + mains.length);
    r = await run(s, 'stop');
    await sleep(200);
    check('stop leaves no browser or daemon process', r.code === 0 && /^OK stopped/.test(r.out) && sessionProcs(sdir).length === 0, r.out + ' left=' + sessionProcs(sdir).length);
    r = await run(s, 'look');
    check('commands after stop explain how to start', r.code === 1 && /^ERROR session .* is not running — start it/.test(r.out), r.out);
    return out;
  };
  let failed = 0;
  try {
    const [a, b] = await Promise.all([suite('phone'), suite('desktop')]); // in parallel: sessions must not disturb each other
    results.push(...a, ...b);
    const extra = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? '' : cut(oneLine(detail), 300) });
    const s1 = `${tag}-x1`, s2 = `${tag}-x2`;
    const [p1, p2] = await Promise.all([run(s1, 'start', 'small', origin + '/'), run(s2, 'start', 'desktop', origin + '/page2')]);
    const [l1, l2] = await Promise.all([run(s1, 'look'), run(s2, 'look')]);
    extra('parallel: two sessions keep separate pages and viewports', p1.code === 0 && p2.code === 0 && l1.out.includes('VIEW small 320x568') && l1.out.includes('# Selftest home') && l2.out.includes('VIEW desktop 1440x900') && l2.out.includes('# Page two'), l1.out + l2.out);
    const dpid = readJson(sessionFile(path.join(base, s1)))?.pid;
    kill(dpid);
    await sleep(300);
    const dead = await run(s1, 'look');
    const again = await run(s1, 'start', 'phone', origin + '/page2');
    extra('a killed daemon is reported and start replaces it (no orphaned browser)', dead.code === 1 && /is not running/.test(dead.out) && again.code === 0 && again.out.includes('# Page two') && sessionProcs(path.join(base, s1)).filter((p) => p.cmd.includes('--remote-debugging-port') && !p.cmd.includes('--type=')).length === 1, dead.out + again.out);
    const ls = await run('list');
    extra('list shows running sessions', ls.code === 0 && ls.out.includes(s1) && ls.out.includes(s2), ls.out);
    const sa = await run('stop-all');
    await sleep(200);
    const leftover = [s1, s2].reduce((n, s) => n + sessionProcs(path.join(base, s)).length, 0);
    extra('stop-all leaves no processes', sa.code === 0 && /^OK stopped \d+ session/.test(sa.out) && leftover === 0, sa.out + ' left=' + leftover);
    const ns = await run('look');
    extra('missing session name is explained', ns.code === 1 && /^ERROR the session name is missing/.test(ns.out), ns.out);
  } catch (e) {
    results.push({ name: 'selftest crashed', ok: false, detail: oneLine(e.stack || e) });
  } finally {
    server.close();
    try { for (const d of fs.readdirSync(base)) await killSession(path.join(base, d)); } catch {}
    try { fs.rmSync(base, { recursive: true, force: true }); fs.rmdirSync(parent); } catch {} // the parent goes too if the selftest created it
  }
  const lines = results.map((r) => { if (!r.ok) failed++; return `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' — got: ' + r.detail}`; });
  lines.push(failed ? `SELFTEST FAILED: ${failed} of ${results.length} checks failed` : `SELFTEST OK: all ${results.length} checks passed`);
  return finish(lines.join('\n'), failed ? 1 : 0);
}

main().catch((e) => finish(`ERROR ${oneLine(e?.stack || e)}`, 1));
