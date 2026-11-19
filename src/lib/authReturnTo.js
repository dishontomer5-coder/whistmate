// Where to go after signing in.
//
// A visitor who opens an invite link (/join?code=…) or a link to a session while signed out
// must end up there once they have logged in, signed up (the e-mail code step included) or
// come back from Google — not on the empty list of groups.
//
// How the address travels:
//   - as ?from_url=<address> on /login and /register. It is the parameter the Base44 SDK's
//     own redirectToLogin() writes; `returnTo`, which the platform's consent page sends
//     next to it, is read as a second name for the same thing.
//   - remembered for this browser tab (sessionStorage, one hour), because the two auth
//     pages link to each other, a password reset leaves through an e-mail, and the app
//     shell sends a signed-out visitor from a group page to the landing page without a
//     parameter. AuthContext remembers the address the page load started on when it turns
//     out that nobody is signed in.
//
// Security — the value comes from the address bar, so anyone can put anything in it.
// It is only ever turned into a PATH ON THIS SITE, never followed to another one:
//   - it must parse to this origin;
//   - the same-origin check alone is not enough: /.//evil.com and /\evil.com parse
//     same-origin but become the protocol-relative //evil.com when assigned to the
//     location, so the result must start with exactly one slash and hold no backslash;
//   - /api/… is refused: those are the platform's own endpoints (the sign-out endpoint
//     redirects wherever it is told), not pages of the app;
//   - the bootstrap parameters app-params.js reads (a token, an app id…) are stripped, so a
//     crafted link cannot inject them into the page that loads after sign-in.

const PARAM_NAMES = ['from_url', 'returnTo'];
const STORAGE_KEY = 'whistmate_return_to';
const MAX_AGE_MS = 60 * 60 * 1000;

const STRIPPED_PARAMS = [
  'access_token', 'clear_access_token', 'app_id', 'app_base_url', 'functions_version',
  'from_url', 'returnTo', 'is_new_user',
];

// Not places to come back to: the sign-in pages themselves (a loop), and the pages a
// signed-out visitor can read anyway — after signing in from those, the groups list is
// the right place to land.
const NOT_A_DESTINATION = new Set([
  '/', '/home', '/about', '/login', '/register', '/forgot-password', '/reset-password',
]);

export const DEFAULT_AFTER_SIGN_IN = '/home';

// Any address → a path on this site that is safe to navigate to, or null.
export function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string' || typeof window === 'undefined') return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    for (const name of STRIPPED_PARAMS) url.searchParams.delete(name);
    const path = url.pathname + url.search + url.hash;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
    const page = url.pathname.replace(/\/+$/, '') || '/';
    if (NOT_A_DESTINATION.has(page) || page === '/api' || page.startsWith('/api/')) return null;
    return path;
  } catch {
    return null;
  }
}

function readRemembered() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored) return null;
    if (Date.now() - stored.at > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return safeReturnPath(stored.path);
  } catch {
    return null; // storage switched off, or something else wrote the key
  }
}

// Keep an address for this tab. Returns the safe path that was kept, or null.
export function rememberReturnTo(raw) {
  const path = safeReturnPath(raw);
  if (!path) return null;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch { /* storage switched off: the from_url parameter still carries it */ }
  return path;
}

export function forgetReturnTo() {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* nothing to forget */ }
}

// Where the visitor is headed: the address in the query string of the page on screen,
// else the one remembered for this tab, else null.
export function pendingReturnTo(search = window.location.search) {
  const params = new URLSearchParams(search);
  for (const name of PARAM_NAMES) {
    const path = safeReturnPath(params.get(name));
    if (path) return path;
  }
  return readRemembered();
}

// The address to open now that the visitor has signed in. It is used once, so it is
// forgotten here. Always a path on this site; the groups list when nothing is pending.
export function consumeReturnTo(search = window.location.search) {
  const path = pendingReturnTo(search) || DEFAULT_AFTER_SIGN_IN;
  forgetReturnTo();
  return path;
}

// '/login' or '/register' with the pending address attached, for links between the auth
// pages and into them: withReturnTo('/register', '/join?code=ABC123').
export function withReturnTo(authPath, returnTo = pendingReturnTo()) {
  const path = safeReturnPath(returnTo);
  return path ? `${authPath}?from_url=${encodeURIComponent(path)}` : authPath;
}

// The address this page load started on, if it is a place worth coming back to.
// Read once, before the router can move the visitor anywhere.
export const BOOT_PATH = typeof window === 'undefined' ? null : safeReturnPath(window.location.href);

// A group name arriving in a link is display text from a stranger: one line, no control
// characters, no longer than a group name can be.
function displayName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// The invitation inside an address: '/join?code=NHUA1B&name=Thursday%20Whist' →
// { code: 'NHUA1B', name: 'Thursday Whist' }. `name` is only what the link says — it is
// shown before sign-in and never trusted; the real name comes from the server afterwards.
// null when the address is not an invite link.
export function inviteFromPath(path) {
  if (!path || typeof window === 'undefined') return null;
  try {
    const url = new URL(path, window.location.origin);
    if ((url.pathname.replace(/\/+$/, '') || '/') !== '/join') return null;
    const code = (url.searchParams.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    return { code, name: displayName(url.searchParams.get('name')) };
  } catch {
    return null;
  }
}

// The link an admin shares: it carries the group's name so the invite page can greet a
// stranger with it before they have an account.
export function inviteLink(group) {
  const params = new URLSearchParams({ code: group?.invite_code || '' });
  const name = displayName(group?.name);
  if (name) params.set('name', name);
  // %20 rather than "+" for a space: chat apps link-ify it the same, and it reads as a name.
  return `${window.location.origin}/join?${params.toString().replace(/\+/g, '%20')}`;
}
