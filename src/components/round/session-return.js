// Going from a round screen back to its session without piling up history.
//
// The session page links into the round screens with `state: { fromSession: true }`.
// When that mark is there the round screen returns with one step back (the session is the
// previous entry); when it is not (the round was opened by a link from somewhere else, or
// by its address) it replaces itself with the session page. Either way the browser's Back
// button never lands on a finished entry screen, and never loops between the two pages.
//
// A step back keeps the scroll position the session page had, which after saving a round
// may be far down the list. `markSessionTop()` asks the session page to show its top —
// the result of the round just saved — the next time it loads; `takeSessionTop()` is how
// the session page reads that request (once).

let showTopOnce = false;

export function markSessionTop() {
  showTopOnce = true;
}

export function takeSessionTop() {
  const wanted = showTopOnce;
  showTopOnce = false;
  return wanted;
}

// The state to pass on links from the session page into a round screen.
export const FROM_SESSION = { fromSession: true };

// navigate / location are react-router's. `top` = show the top of the session page.
export function returnToSession({ navigate, location, sessionId, top = false }) {
  if (top) markSessionTop();
  if (location?.state?.fromSession) navigate(-1);
  else navigate(`/session/${sessionId}`, { replace: true });
}

// ---- a redeal ------------------------------------------------------------------------
//
// A round discarded before it was scored is usually a redeal: the same four play again, in
// the same order. So the discard remembers that table (per session, in this tab), and the
// session page and the table picker offer it — "Redeal — same table" — instead of last
// scored round's table moved on by one. It applies only while the discarded round is still
// the newest one: once a later round exists the memory is stale and ignored.

const REDEAL_PREFIX = 'whistmate:redeal:';

function tabStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

// `playerIds`: the discarded round's four, in bidding order; `roundNumber`: its number.
export function rememberRedeal(sessionId, playerIds, roundNumber) {
  const storage = tabStorage();
  if (!storage || !sessionId || !Array.isArray(playerIds) || playerIds.length !== 4) return;
  try {
    storage.setItem(REDEAL_PREFIX + sessionId, JSON.stringify({ ids: playerIds, round: Number(roundNumber) || 0 }));
  } catch {
    // Nothing lost but a shortcut.
  }
}

// The table to deal again for this session, or [] — given the session's rounds as they are now.
export function redealTable(sessionId, rounds = []) {
  const storage = tabStorage();
  if (!storage || !sessionId) return [];
  try {
    const saved = JSON.parse(storage.getItem(REDEAL_PREFIX + sessionId) || 'null');
    if (!saved || !Array.isArray(saved.ids) || saved.ids.length !== 4) return [];
    const newest = rounds.reduce((max, r) => Math.max(max, Number(r.round_number) || 0), 0);
    if (newest >= saved.round) return [];
    return saved.ids;
  } catch {
    return [];
  }
}

export function forgetRedeal(sessionId) {
  try {
    tabStorage()?.removeItem(REDEAL_PREFIX + sessionId);
  } catch {
    // ignore
  }
}
