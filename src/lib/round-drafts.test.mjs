// Checks for src/lib/round-drafts.js. Run with:  node src/lib/round-drafts.test.mjs   (dependency-free)
//
// The pure half is checked directly; the storage half against a small in-memory stand-in
// for localStorage, and against storages that throw or do not exist.
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  DRAFT_MAX_AGE_MS, draftKey, packDraft, isExpired, parseDraft, applyDraft, describeRestored,
  readDraft, writeDraft, clearDraft, pruneDrafts,
} from './round-drafts.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (err) { failures.push({ name, err }); }
}

// A stand-in for localStorage: the five members the module uses.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const PLAYERS = ['p1', 'p2', 'p3', 'p4'];
const emptyServer = () => ({
  bids: { p1: null, p2: null, p3: null, p4: null },
  tricks: { p1: null, p2: null, p3: null, p4: null },
  reneges: { p1: false, p2: false, p3: false, p4: false },
  trump: null, trumpOwner: null, hierarchy: null,
});
const lockedServer = () => ({ ...emptyServer(), bids: { p1: 4, p2: 3, p3: 2, p4: 5 }, trump: 'hearts', trumpOwner: 'p4' });

// ---- packDraft -------------------------------------------------------------------

test('nothing typed gives no draft at all', () => {
  assert.equal(packDraft({}, NOW), null);
  assert.equal(packDraft({ bids: { p1: null, p2: null }, tricks: {}, reneges: { p1: false }, trump: null, trumpOwner: null, hierarchy: null }, NOW), null);
  assert.equal(packDraft({ editingBids: false }, NOW), null);
});

test('a draft keeps only what was typed, stamped with the time', () => {
  const draft = packDraft({
    bids: { p1: 4, p2: null, p3: 0, p4: undefined },
    reneges: { p1: false, p2: true },
    trump: 'spades', trumpOwner: 'p3', hierarchy: null,
  }, NOW);
  assert.deepEqual(draft, { v: 1, savedAt: NOW, bids: { p1: 4, p3: 0 }, reneges: { p2: true }, trump: 'spades', trumpOwner: 'p3' });
});

test('a zero is a value, not "empty" (a zero bid and zero tricks are kept)', () => {
  const draft = packDraft({ bids: { p1: 0 }, tricks: { p2: 0 } }, NOW);
  assert.deepEqual(draft.bids, { p1: 0 });
  assert.deepEqual(draft.tricks, { p2: 0 });
});

test('values of the wrong shape never get into a draft', () => {
  const draft = packDraft({
    bids: { p1: 14, p2: -1, p3: 2.5, p4: '3', p5: 7 },
    tricks: 'nope',
    reneges: { p1: 'yes', p2: 1, p3: true },
    trump: 'stars', trumpOwner: 42, hierarchy: 'sideways',
  }, NOW);
  assert.deepEqual(draft, { v: 1, savedAt: NOW, bids: { p5: 7 }, reneges: { p3: true } });
});

test('the round stamp travels with a draft, but is not a reason to keep one', () => {
  assert.equal(packDraft({ stamp: '2026-11-19T20:30:00.000Z' }, NOW), null);
  assert.deepEqual(packDraft({ stamp: '2026-11-19T20:30:00.000Z', bids: { p1: 4 } }, NOW),
    { v: 1, savedAt: NOW, bids: { p1: 4 }, stamp: '2026-11-19T20:30:00.000Z' });
  const stored = JSON.stringify(packDraft({ stamp: 'A', tricks: { p1: 2 } }, NOW));
  assert.equal(parseDraft(stored, NOW).stamp, 'A');
});

test('"Edit bids" in progress is itself worth keeping', () => {
  assert.deepEqual(packDraft({ editingBids: true }, NOW), { v: 1, savedAt: NOW, editingBids: true });
});

// ---- isExpired / parseDraft -------------------------------------------------------

test('a draft is ignored after 24 hours, and not a moment before', () => {
  const draft = packDraft({ bids: { p1: 4 } }, NOW);
  assert.equal(isExpired(draft, NOW), false);
  assert.equal(isExpired(draft, NOW + DRAFT_MAX_AGE_MS), false);
  assert.equal(isExpired(draft, NOW + DRAFT_MAX_AGE_MS + 1), true);
  assert.equal(isExpired(draft, NOW + 23 * HOUR), false);
  assert.equal(isExpired(draft, NOW + 25 * HOUR), true);
});

test('a draft stamped far in the future (the clock was changed) is ignored too', () => {
  const draft = packDraft({ bids: { p1: 4 } }, NOW + 25 * HOUR);
  assert.equal(isExpired(draft, NOW), true);
  assert.equal(isExpired(packDraft({ bids: { p1: 4 } }, NOW + HOUR), NOW), false);
});

test('a draft with no usable time stamp is expired', () => {
  assert.equal(isExpired(null, NOW), true);
  assert.equal(isExpired({ v: 1 }, NOW), true);
  assert.equal(isExpired({ v: 1, savedAt: 'yesterday' }, NOW), true);
  assert.equal(isExpired({ v: 1, savedAt: NaN }, NOW), true);
});

test('parseDraft reads back what packDraft wrote', () => {
  const draft = packDraft({ tricks: { p1: 4, p2: 3 }, reneges: { p3: true } }, NOW);
  assert.deepEqual(parseDraft(JSON.stringify(draft), NOW + HOUR), draft);
});

test('parseDraft gives null for anything it cannot trust', () => {
  assert.equal(parseDraft(null, NOW), null);
  assert.equal(parseDraft('', NOW), null);
  assert.equal(parseDraft('{not json', NOW), null);
  assert.equal(parseDraft('"text"', NOW), null);
  assert.equal(parseDraft('null', NOW), null);
  assert.equal(parseDraft(JSON.stringify({ v: 2, savedAt: NOW, bids: { p1: 4 } }), NOW), null, 'another version');
  assert.equal(parseDraft(JSON.stringify({ savedAt: NOW, bids: { p1: 4 } }), NOW), null, 'no version');
  assert.equal(parseDraft(JSON.stringify(packDraft({ bids: { p1: 4 } }, NOW)), NOW + 25 * HOUR), null, 'expired');
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: NOW, bids: { p1: 99 } }), NOW), null, 'nothing usable in it');
});

test('parseDraft drops values of the wrong shape and keeps the rest', () => {
  const stored = JSON.stringify({ v: 1, savedAt: NOW, bids: { p1: 4, p2: 'x' }, trump: 'bananas', extra: { a: 1 } });
  assert.deepEqual(parseDraft(stored, NOW), { v: 1, savedAt: NOW, bids: { p1: 4 } });
});

// ---- applyDraft ------------------------------------------------------------------

test('no draft, or a scored round, restores nothing', () => {
  const draft = packDraft({ bids: { p1: 4 } }, NOW);
  assert.equal(applyDraft(null, { status: 'bidding', playerIds: PLAYERS, server: emptyServer() }), null);
  assert.equal(applyDraft(draft, { status: 'complete', playerIds: PLAYERS, server: emptyServer() }), null);
  assert.equal(applyDraft(draft, { status: 'cancelled', playerIds: PLAYERS, server: emptyServer() }), null);
});

test('a draft typed for another round that carries the same id is not put back', () => {
  const draft = packDraft({ stamp: 'created-monday', bids: { p1: 4, p2: 3 } }, NOW);
  const args = { status: 'bidding', playerIds: PLAYERS, server: emptyServer() };
  assert.equal(applyDraft(draft, { ...args, stamp: 'created-tuesday' }), null);
  assert.equal(applyDraft(draft, { ...args, stamp: 'created-monday' }).restored.bids, 2);
  // An older draft without a stamp, or a round without a date, is still used.
  assert.equal(applyDraft(packDraft({ bids: { p1: 4 } }, NOW), { ...args, stamp: 'created-tuesday' }).restored.bids, 1);
  assert.equal(applyDraft(draft, args).restored.bids, 2);
});

test('bidding: three typed bids and the trump mark come back', () => {
  const draft = packDraft({ bids: { p3: 5, p4: 2, p1: 0 }, trump: 'clubs', trumpOwner: 'p3' }, NOW);
  const state = applyDraft(draft, { status: 'bidding', playerIds: PLAYERS, server: emptyServer() });
  assert.deepEqual(state.bids, { p1: 0, p2: null, p3: 5, p4: 2 });
  assert.equal(state.trump, 'clubs');
  assert.equal(state.trumpOwner, 'p3');
  assert.equal(state.editingBids, false);
  assert.deepEqual(state.restored, { bids: 3, tricks: 0, reneges: 0, trump: true });
});

test('bidding: tricks in a draft are not applied (there are no locked bids to play against)', () => {
  const draft = packDraft({ bids: { p1: 4 }, tricks: { p1: 4 }, reneges: { p2: true } }, NOW);
  const state = applyDraft(draft, { status: 'bidding', playerIds: PLAYERS, server: emptyServer() });
  assert.deepEqual(state.tricks, emptyServer().tricks);
  assert.deepEqual(state.reneges, emptyServer().reneges);
  assert.deepEqual(state.restored, { bids: 1, tricks: 0, reneges: 0, trump: false });
});

test('playing: typed tricks and a renege come back; the locked bids stay the server\'s', () => {
  // A draft left over from the bidding step must not overwrite bids locked since.
  const draft = packDraft({ bids: { p1: 9 }, tricks: { p1: 4, p2: 3 }, reneges: { p3: true } }, NOW);
  const state = applyDraft(draft, { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.deepEqual(state.bids, { p1: 4, p2: 3, p3: 2, p4: 5 });
  assert.equal(state.trump, 'hearts');
  assert.equal(state.trumpOwner, 'p4');
  assert.deepEqual(state.tricks, { p1: 4, p2: 3, p3: null, p4: null });
  assert.deepEqual(state.reneges, { p1: false, p2: false, p3: true, p4: false });
  assert.equal(state.editingBids, false);
  assert.deepEqual(state.restored, { bids: 0, tricks: 2, reneges: 1, trump: false });
});

test('playing, in the middle of "Edit bids": the edit comes back with the tricks', () => {
  const draft = packDraft({
    editingBids: true,
    bids: { p1: 4, p2: 3, p3: 2, p4: 6 }, trump: 'spades', trumpOwner: 'p4',
    tricks: { p1: 4 }, reneges: { p2: true },
  }, NOW);
  const state = applyDraft(draft, { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.equal(state.editingBids, true);
  assert.deepEqual(state.bids, { p1: 4, p2: 3, p3: 2, p4: 6 });
  assert.equal(state.trump, 'spades');
  assert.deepEqual(state.tricks, { p1: 4, p2: null, p3: null, p4: null });
  assert.deepEqual(state.restored, { bids: 1, tricks: 1, reneges: 1, trump: true });
});

test('playing, "Edit bids" with the trump mark removed: it stays removed', () => {
  const draft = packDraft({ editingBids: true, bids: { p1: 4, p2: 3, p3: 2, p4: 5 } }, NOW);
  const state = applyDraft(draft, { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.equal(state.trump, null);
  assert.equal(state.trumpOwner, null);
  assert.deepEqual(state.restored, { bids: 0, tricks: 0, reneges: 0, trump: true });
});

test('a draft that only repeats what the server holds restores nothing new', () => {
  const draft = packDraft({ editingBids: true, bids: { p1: 4, p2: 3, p3: 2, p4: 5 }, trump: 'hearts', trumpOwner: 'p4' }, NOW);
  const state = applyDraft(draft, { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.equal(state.restored, null);
  assert.equal(state.editingBids, true, 'the scorer is still put back where they were');
});

test('values for players who are not in the round are ignored', () => {
  const draft = packDraft({ bids: { p1: 4, stranger: 7 }, trump: 'clubs', trumpOwner: 'stranger' }, NOW);
  const state = applyDraft(draft, { status: 'bidding', playerIds: PLAYERS, server: emptyServer() });
  assert.deepEqual(state.bids, { p1: 4, p2: null, p3: null, p4: null });
  assert.equal(state.trumpOwner, null);
  assert.equal(state.restored.bids, 1);
});

test('applyDraft does not change the server snapshot it was given', () => {
  const server = emptyServer();
  applyDraft(packDraft({ bids: { p1: 4 } }, NOW), { status: 'bidding', playerIds: PLAYERS, server });
  assert.deepEqual(server, emptyServer());
});

// ---- describeRestored ------------------------------------------------------------

test('the note says what came back, in words', () => {
  assert.equal(describeRestored(null), '');
  assert.equal(describeRestored({ bids: 3, tricks: 0, reneges: 0, trump: false }), '3 bids');
  assert.equal(describeRestored({ bids: 1, tricks: 0, reneges: 0, trump: false }), '1 bid');
  assert.equal(describeRestored({ bids: 3, tricks: 0, reneges: 0, trump: true }), '3 bids and the trump mark');
  assert.equal(describeRestored({ bids: 0, tricks: 2, reneges: 1, trump: false }), 'tricks for 2 players and 1 renege');
  assert.equal(describeRestored({ bids: 1, tricks: 1, reneges: 2, trump: true }), '1 bid, the trump mark, tricks for 1 player and 2 reneges');
});

// ---- storage ---------------------------------------------------------------------

test('write then read gives the draft back; each round has its own entry', () => {
  const storage = fakeStorage();
  writeDraft('r1', { bids: { p1: 4, p2: 3, p3: 2 } }, { storage, now: NOW });
  writeDraft('r2', { tricks: { p1: 1 } }, { storage, now: NOW });
  assert.deepEqual(Object.keys(storage.dump()).sort(), [draftKey('r1'), draftKey('r2')]);
  assert.deepEqual(readDraft('r1', { storage, now: NOW + HOUR }).bids, { p1: 4, p2: 3, p3: 2 });
  assert.deepEqual(readDraft('r2', { storage, now: NOW + HOUR }).tricks, { p1: 1 });
  assert.equal(readDraft('r3', { storage, now: NOW }), null);
});

test('writing an empty draft removes the entry (locked or saved: nothing left to keep)', () => {
  const storage = fakeStorage();
  writeDraft('r1', { bids: { p1: 4 } }, { storage, now: NOW });
  assert.equal(writeDraft('r1', { tricks: {}, reneges: {} }, { storage, now: NOW }), null);
  assert.deepEqual(storage.dump(), {});
});

test('clearDraft removes one round and leaves the others', () => {
  const storage = fakeStorage();
  writeDraft('r1', { bids: { p1: 4 } }, { storage, now: NOW });
  writeDraft('r2', { bids: { p1: 5 } }, { storage, now: NOW });
  clearDraft('r1', { storage });
  assert.equal(readDraft('r1', { storage, now: NOW }), null);
  assert.deepEqual(readDraft('r2', { storage, now: NOW }).bids, { p1: 5 });
});

test('a draft older than 24 hours is not read back', () => {
  const storage = fakeStorage();
  writeDraft('r1', { bids: { p1: 4 } }, { storage, now: NOW });
  assert.notEqual(readDraft('r1', { storage, now: NOW + 23 * HOUR }), null);
  assert.equal(readDraft('r1', { storage, now: NOW + 25 * HOUR }), null);
});

test('pruneDrafts removes expired and unreadable drafts and nothing else', () => {
  const storage = fakeStorage({ other_app_key: 'keep me', eos_activeGroupId: 'g1' });
  writeDraft('old', { bids: { p1: 4 } }, { storage, now: NOW - 30 * HOUR });
  writeDraft('fresh', { bids: { p1: 4 } }, { storage, now: NOW - HOUR });
  storage.setItem(draftKey('broken'), '{oops');
  assert.equal(pruneDrafts({ storage, now: NOW }), 2);
  assert.deepEqual(Object.keys(storage.dump()).sort(), ['eos_activeGroupId', 'other_app_key', draftKey('fresh')].sort());
});

test('a storage that throws, or no storage at all, never throws to the caller', () => {
  const broken = {
    get length() { throw new Error('denied'); },
    key() { throw new Error('denied'); },
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(readDraft('r1', { storage: broken, now: NOW }), null);
  assert.equal(writeDraft('r1', { bids: { p1: 4 } }, { storage: broken, now: NOW }), null);
  assert.doesNotThrow(() => clearDraft('r1', { storage: broken }));
  assert.equal(pruneDrafts({ storage: broken, now: NOW }), 0);
  // node has no localStorage: the defaults must cope with that too.
  assert.equal(readDraft('r1'), null);
  assert.equal(writeDraft('r1', { bids: { p1: 4 } }), null);
  assert.doesNotThrow(() => clearDraft('r1'));
  assert.equal(pruneDrafts(), 0);
  assert.equal(readDraft('', { storage: fakeStorage(), now: NOW }), null);
});

// ---- the night the scorekeeper described -------------------------------------------

test('three bids typed, the screen left and reopened: the bids are back; locking clears them', () => {
  const storage = fakeStorage();
  // typed on the bidding screen
  writeDraft('r5', { bids: { p3: 4, p4: 3, p1: 2, p2: null }, trump: null, trumpOwner: null, hierarchy: null }, { storage, now: NOW });
  // …left, came back a minute later
  const back = applyDraft(readDraft('r5', { storage, now: NOW + 60_000 }), { status: 'bidding', playerIds: PLAYERS, server: emptyServer() });
  assert.deepEqual(back.bids, { p1: 2, p2: null, p3: 4, p4: 3 });
  assert.equal(describeRestored(back.restored), '3 bids');
  // locked: the server holds the bids now, the screen writes what is left to keep — nothing
  writeDraft('r5', { tricks: { p1: null, p2: null, p3: null, p4: null }, reneges: {} }, { storage, now: NOW + 120_000 });
  assert.equal(readDraft('r5', { storage, now: NOW + 120_000 }), null);
});

test('where the bidding started is kept through the playing step, on its own if need be', () => {
  const draft = packDraft({ tricks: {}, reneges: {}, firstBidder: 'p3' }, NOW);
  assert.deepEqual(draft, { v: 1, savedAt: NOW, firstBidder: 'p3' });
  const state = applyDraft(draft, { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.equal(state.firstBidder, 'p3');
  assert.equal(state.restored, null, 'nothing to announce: it is not something the scorer typed');
  const stranger = applyDraft(packDraft({ firstBidder: 'zz' }, NOW), { status: 'playing', playerIds: PLAYERS, server: lockedServer() });
  assert.equal(stranger.firstBidder, null, 'a player not in the round is ignored');
  assert.equal(parseDraft(JSON.stringify(draft), NOW).firstBidder, 'p3');
});

if (failures.length) {
  for (const { name, err } of failures) console.error(`FAIL ${name}\n  ${err.message}`);
  console.error(`\n${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`round-drafts: ${passed} tests passed`);
