// Checks for src/lib/format.js. Run with:  node src/lib/format.test.mjs   (dependency-free)
//
// The date checks do not change the process time zone. They compare against dates built
// explicitly from (year, month, day) — LOCAL midnight — so they hold on any machine, and
// they fail on any machine that is not exactly on UTC if a date-only string is ever read as
// UTC midnight again (that is the bug: west of UTC it shows the day before).
import assert from 'node:assert/strict';
import {
  parseDate, formatDate, todayLocalISO, defaultSessionName, sessionName,
  formatScore, scoreTone, formatAvg, formatPct, errorMessage, OFFLINE_MESSAGE, noteSessionName,
} from './format.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (err) { failures.push({ name, err }); }
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shown = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Days chosen to sit on every kind of edge: month and year ends, a leap day, and the days
// around daylight-saving changes in Israel, Europe and the US.
const DAYS = [
  [2026, 11, 19], [2026, 1, 1], [2026, 12, 31], [2024, 2, 29], [2025, 3, 1],
  [2026, 3, 27], [2026, 3, 29], [2026, 10, 25], [2026, 3, 8], [2026, 11, 1], [2000, 1, 1], [2099, 12, 31],
];

// ---- a calendar date is a calendar date (ruling 63) ------------------------------

test('a date-only string is local midnight of that day, not UTC midnight', () => {
  for (const [y, m, d] of DAYS) {
    const parsed = parseDate(iso(y, m, d));
    const local = new Date(y, m - 1, d);
    assert.equal(parsed.getTime(), local.getTime(), `${iso(y, m, d)} is read as local midnight`);
    assert.equal(parsed.getFullYear(), y);
    assert.equal(parsed.getMonth(), m - 1);
    assert.equal(parsed.getDate(), d);
  }
});

test('formatDate shows the same calendar day that was stored', () => {
  for (const [y, m, d] of DAYS) {
    assert.equal(formatDate(iso(y, m, d)), shown(new Date(y, m - 1, d)));
  }
  // The text itself, for one day — built from numbers, so no zone is involved.
  assert.equal(formatDate('2026-11-19'), 'Nov 19, 2026');
  assert.equal(formatDate(' 2026-11-19 '), 'Nov 19, 2026');
});

test('the day shown never depends on the offset between local time and UTC', () => {
  // What the bug did: read "2026-11-19" as 00:00 UTC. Anywhere west of UTC that instant is
  // still the 18th. So wherever this machine is not on UTC, the parsed date must NOT be
  // the UTC reading — and the UTC reading, shifted by the zone offset, lands on the same day.
  for (const [y, m, d] of DAYS) {
    const parsed = parseDate(iso(y, m, d));
    const utcReading = new Date(Date.UTC(y, m - 1, d));
    if (parsed.getTimezoneOffset() !== 0) assert.notEqual(parsed.getTime(), utcReading.getTime());
    // The UTC fields of the UTC reading are the stored day; the LOCAL fields of ours are too.
    assert.deepEqual(
      [parsed.getFullYear(), parsed.getMonth(), parsed.getDate()],
      [utcReading.getUTCFullYear(), utcReading.getUTCMonth(), utcReading.getUTCDate()],
    );
  }
});

test('full timestamps keep their meaning: they are moments, not calendar days', () => {
  const moment = '2026-11-19T22:30:00.000Z';
  assert.equal(parseDate(moment).getTime(), Date.UTC(2026, 10, 19, 22, 30));
  assert.equal(formatDate(moment), shown(new Date(Date.UTC(2026, 10, 19, 22, 30))));
  const date = new Date(2026, 10, 19, 20, 30);
  assert.equal(parseDate(date), date);
  assert.equal(formatDate(date.toISOString()), shown(date));
});

test('missing or unreadable dates show nothing', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('not a date'), '');
});

test('todayLocalISO is the local calendar day and round-trips through formatDate', () => {
  const before = new Date();
  const today = todayLocalISO();
  const after = new Date();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  // Built from the local year, month and day (tolerating a midnight tick during the test).
  const candidates = [before, after].map((d) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  assert.ok(candidates.includes(today), `${today} is one of ${candidates.join(' / ')}`);
  const [y, m, d] = today.split('-').map(Number);
  assert.equal(formatDate(today), shown(new Date(y, m - 1, d)));
  assert.equal(parseDate(today).getDate(), d);
});

test('the default session name is the weekday and date of that calendar day', () => {
  // 19 Nov 2026 is a Thursday whatever the zone — the weekday comes from the local date.
  assert.equal(new Date(2026, 10, 19).getDay(), 4);
  assert.equal(defaultSessionName('2026-11-19'), 'Thursday, 19 Nov');
  assert.equal(defaultSessionName('2026-01-01'), 'Thursday, 1 Jan');
  assert.equal(defaultSessionName('2024-02-29'), 'Thursday, 29 Feb');
  assert.equal(defaultSessionName('nonsense'), 'Session');
  assert.equal(sessionName({ name: '  ליל חמישי ', session_date: '2026-11-19' }), 'ליל חמישי');
  assert.equal(sessionName({ name: '', session_date: '2026-11-19' }), 'Thursday, 19 Nov');
  assert.equal(sessionName({ session_date: '2026-11-20' }), 'Friday, 20 Nov');
});

// ---- scores ----------------------------------------------------------------------

test('noteSessionName: a note names its session as the session is named everywhere', () => {
  assert.equal(noteSessionName({ game_name: 'Whist Night', game_date: '2026-07-16' }), defaultSessionName('2026-07-16'));
  assert.equal(noteSessionName({ game_name: 'Rematch', game_date: '2026-11-05' }), 'Rematch');
  assert.equal(noteSessionName({ game_name: null, game_date: null }), null);
});

test('formatAvg: one decimal, signed, everywhere', () => {
  assert.equal(formatAvg(11.923), '+11.9');
  assert.equal(formatAvg(-0.54), '-0.5');
  assert.equal(formatAvg(2.66), '+2.7');
  // A whole average keeps its decimal, so it lines up with the others (+11.0 beside +11.7).
  assert.equal(formatAvg(3), '+3.0');
  assert.equal(formatAvg(11), '+11.0');
  assert.equal(formatAvg(-10), '-10.0');
  assert.equal(formatAvg(10.96), '+11.0');
  assert.equal(formatAvg(-0.04), '0.0');
  assert.equal(formatAvg(0), '0.0');
  assert.equal(formatAvg(null), '0.0');
});

test('formatScore and scoreTone: gained, zero, lost', () => {
  assert.equal(formatScore(26), '+26');
  assert.equal(formatScore(-10), '-10');
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(null), '0');
  assert.equal(scoreTone(26), 'text-foreground font-semibold');
  assert.equal(scoreTone(0.5), 'text-foreground font-semibold');
  assert.equal(scoreTone(-10), 'text-negative');
  assert.equal(scoreTone(0), 'text-muted-foreground');
  assert.equal(scoreTone(null), 'text-muted-foreground');
  assert.equal(scoreTone(undefined), 'text-muted-foreground');
  assert.equal(formatPct(0.42), '42%');
});

// ---- errors ----------------------------------------------------------------------

test('errorMessage: the server\'s words first, plain words when the server was never reached', () => {
  assert.equal(errorMessage({ response: { data: { error: 'This group is archived — it is read-only' } }, message: 'Request failed' }), 'This group is archived — it is read-only');
  assert.equal(errorMessage({ message: 'Network Error' }), OFFLINE_MESSAGE);
  assert.equal(errorMessage(new TypeError('Failed to fetch')), OFFLINE_MESSAGE);
  assert.equal(OFFLINE_MESSAGE, "Couldn't reach the server — nothing was lost. Try again.");
  assert.equal(errorMessage({ message: 'Request failed with status code 500' }, 'Failed to save.'), 'Request failed with status code 500');
  assert.equal(errorMessage({}, 'Failed to save.'), 'Failed to save.');
  assert.equal(errorMessage(null, 'Failed to save.'), 'Failed to save.');
  assert.equal(errorMessage(undefined), 'Something went wrong. Try again.');
});

// ---- report ----------------------------------------------------------------------

if (failures.length) {
  for (const { name, err } of failures) console.error(`FAIL  ${name}\n      ${err.message}`);
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`format: ${passed} passed`);
