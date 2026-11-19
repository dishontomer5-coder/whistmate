// Score with an explicit sign, e.g. "+26", "-10", "0".
export function formatScore(points) {
  const v = Number(points) || 0;
  return `${v > 0 ? '+' : ''}${v}`;
}

// The text colour of a score — one meaning per colour, everywhere a score is shown:
// gained = the foreground colour (gold is rationed — src/index.css; the "+" and a bold
// weight say "gained"), zero = muted, lost = the red text colour. Use it instead of deciding
// the colour at the call site:  <span className={scoreTone(points)}>{formatScore(points)}</span>
// (The three class names are written out in full so Tailwind keeps them.)
export function scoreTone(points) {
  const v = Number(points) || 0;
  if (v > 0) return 'text-foreground font-semibold';
  if (v < 0) return 'text-negative';
  return 'text-muted-foreground';
}

// An average, always with one decimal and signed like a score: 11.923 -> "+11.9",
// -0.54 -> "-0.5", 3 -> "+3.0", 0 -> "0.0". The one way an average is shown, on every screen.
export function formatAvg(value) {
  const v = Math.round((Number(value) || 0) * 10) / 10;
  if (v === 0) return '0.0'; // also -0, so a tiny loss never shows as "-0.0"
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// A percentage from a 0..1 ratio, e.g. 0.42 -> "42%".
export function formatPct(ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)}%`;
}

// Today's date as YYYY-MM-DD in the user's LOCAL timezone. Using
// new Date().toISOString().slice(0,10) gives the UTC day, so an after-midnight
// session in Israel (UTC+2/3) would be dated to the previous day.
export function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A calendar date is a calendar date. A date-only string ("2026-11-19", which is how a
// session's date is stored) means that day wherever the reader is, so it is read as LOCAL
// midnight of that day. `new Date("2026-11-19")` would be UTC midnight — the evening of the
// 18th for anyone west of Greenwich, who would then see the session dated a day early.
// Full timestamps ("2026-11-19T20:30:00.000Z") are real moments and are left to Date.
// Every date helper in this file reads its input through here; format.test.mjs pins it.
export function parseDate(value) {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

// "Nov 19, 2026". Empty for a missing or unreadable date.
export function formatDate(dateString) {
  if (!dateString) return '';
  const date = parseDate(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// What a session is called when nobody named it: the weekday and date of the night,
// e.g. "Thursday, 19 Nov". Also the suggested name for a new session.
export function defaultSessionName(dateString) {
  const date = dateString ? parseDate(dateString) : new Date();
  if (Number.isNaN(date.getTime())) return 'Session';
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${weekday}, ${dayMonth}`;
}

// The name to show for a session: the one it was given, or the default above.
export function sessionName(session) {
  const given = (session?.name || '').trim();
  return given || defaultSessionName(session?.session_date || session?.created_date);
}

// The session a note was pinned to, by the same name the session has everywhere else
// (returning-player-6), or null for a note not pinned to a session. A note stores a copy of
// the session's name (game_name) and date (game_date); a session without a name was stored
// as "Whist Night", which is read as no name, so it gets the usual "Thursday, 16 Jul".
export const UNNAMED_NOTE_SESSION = 'Whist Night';
export function noteSessionName(note) {
  if (!note?.game_name && !note?.game_date) return null;
  const given = note.game_name === UNNAMED_NOTE_SESSION ? '' : note.game_name;
  return sessionName({ name: given, session_date: note.game_date });
}

// The sentence to show when a request fails. Prefers what the server said; a request
// that never reached the server (axios reports "Network Error") gets plain words
// instead of the library's.
//   catch (err) { setError(errorMessage(err, 'Could not save the round.')); }
export const OFFLINE_MESSAGE = "Couldn't reach the server — nothing was lost. Try again.";
export function errorMessage(err, fallback = 'Something went wrong. Try again.') {
  const fromServer = err?.response?.data?.error;
  if (fromServer) return String(fromServer);
  const raw = typeof err === 'string' ? err : err?.message;
  if (!raw) return fallback;
  if (/network error|failed to fetch|load failed/i.test(raw)) return OFFLINE_MESSAGE;
  return String(raw);
}
