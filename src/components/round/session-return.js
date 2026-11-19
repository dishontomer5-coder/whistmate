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
