// What the scorer has typed for a round but not yet locked or saved, kept in the browser.
//
// Bids, the trump mark, tricks and reneges live only on the screen until "Lock bids" or
// "Save round". Leaving the round screen, a reload or the Back button used to throw them
// away. They are now written to localStorage on every change — one entry per round — and
// read back when the scorer returns, with a one-line note saying so.
//
//   key      whistmate:round-draft:<round id>
//   value    { v: 1, savedAt, stamp?, bids?, trump?, trumpOwner?, hierarchy?, tricks?, reneges?, editingBids? }
//            bids / tricks: { [player_id]: 0..13 }   reneges: { [player_id]: true }
//            stamp: when the round was created (its created_date) — a draft is only put
//            back into the very round it was typed for, never into another one that
//            happens to carry the same id.
//   removed  when the round is locked, saved or discarded (nothing is left to keep), and
//            ignored once it is 24 hours old.
//
// The top half of this file is pure (no storage, no clock: `now` is passed in) and is what
// round-drafts.test.mjs checks. The bottom half is the thin localStorage wrapper; every
// call there is wrapped, because storage can be full, disabled or missing (private mode),
// and losing a draft must never break the round screen.
//
// No imports, like scoring.js, so the test runs with bare `node`.

export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'whistmate:round-draft:';
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];
const HIERARCHIES = ['standard', 'down_up'];

export const draftKey = (roundId) => `${KEY_PREFIX}${roundId}`;

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 13;

// { [player_id]: 0..13 } with everything else dropped; null when nothing is left.
function cleanCounts(map) {
  if (!map || typeof map !== 'object') return null;
  const out = {};
  for (const [playerId, value] of Object.entries(map)) {
    if (isCount(value)) out[playerId] = value;
  }
  return Object.keys(out).length ? out : null;
}

// { [player_id]: true } for the players marked; null when nobody is.
function cleanFlags(map) {
  if (!map || typeof map !== 'object') return null;
  const out = {};
  for (const [playerId, value] of Object.entries(map)) {
    if (value === true) out[playerId] = true;
  }
  return Object.keys(out).length ? out : null;
}

// ---- pure ------------------------------------------------------------------------

// The draft to store for what is on screen, or null when there is nothing worth keeping
// (no number typed, no mark made). Pass only what the server does not have yet:
//   while bidding:        { bids, trump, trumpOwner, hierarchy }
//   while playing:        { tricks, reneges }
//   while re-editing bids { tricks, reneges, editingBids: true, bids, trump, trumpOwner, hierarchy }
export function packDraft(fields = {}, now = Date.now()) {
  const draft = {};
  const bids = cleanCounts(fields.bids);
  const tricks = cleanCounts(fields.tricks);
  const reneges = cleanFlags(fields.reneges);
  if (bids) draft.bids = bids;
  if (tricks) draft.tricks = tricks;
  if (reneges) draft.reneges = reneges;
  if (SUITS.includes(fields.trump)) draft.trump = fields.trump;
  if (typeof fields.trumpOwner === 'string' && fields.trumpOwner) draft.trumpOwner = fields.trumpOwner;
  if (HIERARCHIES.includes(fields.hierarchy)) draft.hierarchy = fields.hierarchy;
  if (fields.editingBids === true) draft.editingBids = true;
  if (Object.keys(draft).length === 0) return null;
  // The stamp alone is not worth keeping, so it is added after the "anything typed?" test.
  if (typeof fields.stamp === 'string' && fields.stamp) draft.stamp = fields.stamp;
  return { v: DRAFT_VERSION, savedAt: now, ...draft };
}

// Older than 24 hours (or stamped more than 24 hours ahead, after a clock change): ignored.
export function isExpired(draft, now = Date.now()) {
  if (!draft || typeof draft.savedAt !== 'number' || !Number.isFinite(draft.savedAt)) return true;
  return Math.abs(now - draft.savedAt) > DRAFT_MAX_AGE_MS;
}

// A stored value read back: the draft, or null when it is unreadable, from another
// version, expired or empty. What comes back holds only values of the right shape.
export function parseDraft(text, now = Date.now()) {
  if (typeof text !== 'string' || text === '') return null;
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || raw.v !== DRAFT_VERSION || isExpired(raw, now)) return null;
  const clean = packDraft(raw, raw.savedAt);
  return clean;
}

// Put a draft back on the screen.
//
//   draft     from parseDraft() (may be null)
//   status    the round's status on the server: 'bidding' | 'playing' | …
//   stamp     the round's created_date; a draft stamped for a different round is ignored
//   playerIds the round's four player ids
//   server    what the server holds: { bids, tricks, reneges, trump, trumpOwner, hierarchy }
//
// Returns null when there is nothing to restore (no draft, or a round that is already
// scored). Otherwise the state to show — the server's values with the draft laid over
// them — plus `restored`, the count of things that really came from the draft
// ({ bids, tricks, reneges, trump }), or null when the draft adds nothing new.
//
//   bidding  the draft's bids and trump mark are used.
//   playing  the draft's tricks and reneges are used. Its bids are used only when the
//            scorer was in the middle of "Edit bids" (editingBids) — otherwise the bids
//            are locked on the server and the server's are the truth.
// Values for players who are not in the round are ignored.
export function applyDraft(draft, { status, stamp, playerIds = [], server = {} }) {
  if (!draft || (status !== 'bidding' && status !== 'playing')) return null;
  if (draft.stamp && stamp && draft.stamp !== stamp) return null;
  const inRound = new Set(playerIds);
  const only = (map) => Object.fromEntries(Object.entries(map || {}).filter(([playerId]) => inRound.has(playerId)));

  const state = {
    bids: { ...(server.bids || {}) },
    tricks: { ...(server.tricks || {}) },
    reneges: { ...(server.reneges || {}) },
    trump: server.trump ?? null,
    trumpOwner: server.trumpOwner ?? null,
    hierarchy: server.hierarchy ?? null,
    editingBids: false,
  };
  const restored = { bids: 0, tricks: 0, reneges: 0, trump: false };

  const useBids = status === 'bidding' || draft.editingBids === true;
  if (useBids) {
    for (const [playerId, value] of Object.entries(only(draft.bids))) {
      if (state.bids[playerId] !== value) restored.bids += 1;
      state.bids[playerId] = value;
    }
    const owner = draft.trumpOwner && inRound.has(draft.trumpOwner) ? draft.trumpOwner : null;
    // While bids are being re-edited the draft holds the whole trump record, so a mark
    // that was removed comes back removed. While bidding the server has none to lose.
    const mark = status === 'bidding'
      ? { trump: draft.trump ?? state.trump, trumpOwner: owner ?? state.trumpOwner, hierarchy: draft.hierarchy ?? state.hierarchy }
      : { trump: draft.trump ?? null, trumpOwner: owner, hierarchy: draft.hierarchy ?? null };
    if (mark.trump !== state.trump || mark.trumpOwner !== state.trumpOwner || mark.hierarchy !== state.hierarchy) {
      restored.trump = true;
    }
    Object.assign(state, mark);
    state.editingBids = status === 'playing';
  }

  if (status === 'playing') {
    for (const [playerId, value] of Object.entries(only(draft.tricks))) {
      if (state.tricks[playerId] !== value) restored.tricks += 1;
      state.tricks[playerId] = value;
    }
    for (const playerId of Object.keys(only(draft.reneges))) {
      if (!state.reneges[playerId]) restored.reneges += 1;
      state.reneges[playerId] = true;
    }
  }

  const anything = restored.bids || restored.tricks || restored.reneges || restored.trump;
  return { ...state, restored: anything ? restored : null };
}

// "3 bids and the trump mark", "tricks for 2 players and 1 renege" — what the note says came back.
export function describeRestored(restored) {
  if (!restored) return '';
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [];
  if (restored.bids) parts.push(count(restored.bids, 'bid'));
  if (restored.trump) parts.push('the trump mark');
  if (restored.tricks) parts.push(`tricks for ${count(restored.tricks, 'player')}`);
  if (restored.reneges) parts.push(count(restored.reneges, 'renege'));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// ---- storage ---------------------------------------------------------------------

// The browser's localStorage, or null where there is none (node, a blocked browser).
function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// The draft saved for a round, or null.
export function readDraft(roundId, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !roundId) return null;
  try {
    return parseDraft(storage.getItem(draftKey(roundId)), now);
  } catch {
    return null;
  }
}

// Save what is on screen for a round — or remove the entry when nothing is left to keep.
// Returns the draft that was stored, or null.
export function writeDraft(roundId, fields, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || !roundId) return null;
  try {
    const draft = packDraft(fields, now);
    if (draft) storage.setItem(draftKey(roundId), JSON.stringify(draft));
    else storage.removeItem(draftKey(roundId));
    return draft;
  } catch {
    return null;
  }
}

// The round was locked, saved or discarded: forget its draft.
export function clearDraft(roundId, { storage = defaultStorage() } = {}) {
  if (!storage || !roundId) return;
  try {
    storage.removeItem(draftKey(roundId));
  } catch {
    // nothing to do: a draft that cannot be removed expires by itself
  }
}

// Remove every round's draft that is expired or unreadable, so abandoned rounds do not
// pile up in the browser. Returns how many were removed.
export function pruneDrafts({ storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage) return 0;
  try {
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(KEY_PREFIX) && !parseDraft(storage.getItem(key), now)) stale.push(key);
    }
    stale.forEach((key) => storage.removeItem(key));
    return stale.length;
  } catch {
    return 0;
  }
}
