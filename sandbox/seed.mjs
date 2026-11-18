// Seed data for the sandbox — written THROUGH THE REAL BACKEND FUNCTIONS.
//
// Groups, members, sessions, rounds, bids, results and notes are all created by calling createGroup,
// addGhostMember, previewGroupByCode / joinGroupByCode, startSession, startRound, submitBids,
// saveRoundResults, closeSession, createNote and setGroupStatus as the seeded users. So every score,
// table state and "everyone falls" flag in the sandbox was produced by the app's own code, and each
// scored round is re-checked here against src/lib/scoring.js (mismatches are reported, not hidden).
//
// Only two things are written straight into the store, because no function does them:
//   - user accounts (on Base44 that is the platform's sign-up, not app code);
//   - Session.game_limit on one session (startSession always stores null and no screen sets it).
//
// Deterministic: a seeded PRNG decides every bid and trick, and while the seed runs the clock is
// simulated (backend.mjs swaps Date for one driven by `clock.ms`), so created dates spread over about
// five months and end "today". Same code + same day = the same data, ids and invite codes.
//
// Run directly to print what gets seeded:  node sandbox/seed.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeRng, ROOT } from './backend.mjs';

export const PASSWORD = 'whist123';
export const GOOGLE_USER_EMAIL = 'gal.google@example.com';

// key -> account. `name` is what the README / info endpoint call them.
export const SEED_USERS = [
  { key: 'maya', email: 'maya@example.com', full_name: 'Maya Cohen', role: 'user', about: 'group admin of Thursday Whist, member of Family Table' },
  { key: 'dan', email: 'dan@example.com', full_name: 'Dan Levi', role: 'user', about: 'player in Thursday Whist, admin of the archived Old Crew' },
  { key: 'noa', email: 'noa@example.com', full_name: 'נועה', role: 'user', about: 'player in Thursday Whist (display name נועה), admin of Family Table' },
  { key: 'omer', email: 'omer@example.com', full_name: 'Omer Katz', role: 'user', about: 'player in Thursday Whist (claimed an unclaimed player after two sessions), Old Crew' },
  { key: 'rachel', email: 'rachel@example.com', full_name: 'Rachel Stein', role: 'user', about: 'player in Thursday Whist (joined later), Old Crew, admin of a soft-deleted group' },
  { key: 'newbie', email: 'newbie@example.com', full_name: 'Nir Newbie', role: 'user', about: 'signed up, in no group' },
  { key: 'root', email: 'root@example.com', full_name: 'Root Admin', role: 'admin', about: 'app admin (role: admin), in no group' },
  { key: 'google', email: GOOGLE_USER_EMAIL, full_name: 'Gal Google', role: 'user', about: 'the canned account "Continue with Google" signs in as; in no group' },
];

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs', 'notrump'];
const MIN = 60_000;

// How each player tends to play: `skill` = chance of hitting the contract, `lean` > 0 over-bids
// (loses points taking too few — "The Greedy"), `lean` < 0 under-bids ("The Coward").
const TRAITS = {
  Maya: { skill: 0.62, lean: 0.05 }, Dan: { skill: 0.5, lean: 0.3 }, 'נועה': { skill: 0.57, lean: 0 },
  Omer: { skill: 0.45, lean: -0.3 }, Rachel: { skill: 0.52, lean: -0.05 }, 'יוסי': { skill: 0.4, lean: 0.2 },
  'אבי': { skill: 0.48, lean: -0.15 }, 'אמא': { skill: 0.6, lean: 0 }, 'סבא משה': { skill: 0.42, lean: 0.15 },
};
const traits = (name) => TRAITS[name] || { skill: 0.5, lean: 0 };

// One legal round for four seated players: tricks total 13, bids never total 13, bids 1..9 unless a
// zero bid is planted. plant = { ef?: true, zero?: { who, made, took?, table? } }.
function genRound(rng, names, plant = {}) {
  const zi = plant.zero ? names.indexOf(plant.zero.who) : -1;
  for (let attempt = 0; attempt < 20000; attempt++) {
    const weights = names.map(() => 0.5 + rng() * 1.5);
    const tricks = [0, 0, 0, 0];
    let remaining = 13;
    if (zi >= 0) {
      weights[zi] = 0;
      if (!plant.zero.made) { tricks[zi] = plant.zero.took; remaining -= plant.zero.took; }
    }
    const total = weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < remaining; i++) {
      let x = rng() * total;
      let seat = 0;
      while (seat < 3 && x >= weights[seat]) { x -= weights[seat]; seat++; }
      tricks[seat] += 1;
    }
    const bids = names.map((name, i) => {
      if (i === zi) return 0;
      const t = tricks[i];
      const tr = traits(name);
      if (!plant.ef && t >= 1 && rng() < tr.skill) return t;
      const r = rng();
      const size = r < 0.58 ? 1 : r < 0.86 ? 2 : r < 0.96 ? 3 : r < 0.985 ? 4 : 5;
      let bid = rng() < 0.5 + tr.lean ? t + size : t - size;
      if (bid < 1) bid = t + size;
      if (bid > 9) bid = t - size;
      return bid;
    });
    if (bids.some((bid, i) => i !== zi && (bid < 1 || bid > 9))) continue;
    const sum = bids.reduce((s, x) => s + x, 0);
    if (sum === 13 || sum < 9 || sum > 17) continue;
    const anyMade = bids.some((bid, i) => bid === tricks[i]);
    if (plant.ef ? anyMade : !anyMade) continue;
    if (zi >= 0) {
      if (tricks[zi] !== (plant.zero.made ? 0 : plant.zero.took)) continue;
      if (plant.zero.table && (sum >= 14 ? 'up' : 'down') !== plant.zero.table) continue;
    }
    return { bids, tricks };
  }
  throw new Error(`seed: could not generate a round for ${JSON.stringify(plant)}`);
}

// Four of the night's attendees, rotating who sits out and who bids first.
function seatsFor(attendees, n, must) {
  const k = attendees.length;
  const seats = attendees.map((_, i) => attendees[(i + n - 1) % k]).slice(0, 4);
  for (const who of must) {
    if (seats.includes(who)) continue;
    if (!attendees.includes(who)) throw new Error(`seed: ${who} is not at this session`);
    for (let i = 3; i >= 0; i--) if (!must.includes(seats[i])) { seats[i] = who; break; }
  }
  return seats;
}

export async function seed(b, { clock, anchor, RealDate }) {
  const { scoreRound } = await import(pathToFileURL(path.join(ROOT, 'src/lib/scoring.js')).href);
  const warnings = [];
  const tally = { sessions: 0, rounds_scored: 0, rounds_in_play: 0, everyone_falls: 0, reneges: 0, zero_bids_made: 0, zero_bids_failed: 0, trump_records: 0, notes: 0 };

  // ---- time (local, like the people using the app) ----
  const midnight = new RealDate(anchor);
  midnight.setHours(0, 0, 0, 0);
  const local = (daysAgo, hh, mm = 0) => {
    const d = new RealDate(midnight);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (ms) => { const d = new RealDate(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const tick = (ms) => { clock.ms += Math.max(1000, Math.round(ms)); };

  // ---- small helpers over the real functions ----
  const U = {}; // key -> User row
  const G = {}; // key -> { id, name, members: { playerName: memberId }, sessions: { key: Session } }
  async function call(userKey, fn, body, expect = 200) {
    const res = await b.invokeAs(U[userKey].id, fn, body);
    if (res.status !== expect) {
      throw new Error(`seed: ${fn} as ${userKey} answered ${res.status} ${JSON.stringify(res.data)} (expected ${expect})`);
    }
    return res.data;
  }
  async function createGroup(key, owner, body) {
    const { group } = await call(owner, 'createGroup', body);
    const [mine] = await b.service.GroupMember.filter({ group_id: group.id, user_id: U[owner].id });
    G[key] = { id: group.id, name: group.name, invite_code: group.invite_code, members: { [body.player_name]: mine.id }, sessions: {} };
  }
  async function addGhost(key, admin, playerName) {
    const { member } = await call(admin, 'addGhostMember', { group_id: G[key].id, player_name: playerName });
    G[key].members[playerName] = member.id;
  }
  async function joinAsNew(key, user, playerName) {
    await call(user, 'previewGroupByCode', { invite_code: G[key].invite_code });
    const { groups } = await call(user, 'joinGroupByCode', { invite_code: G[key].invite_code, player_name: playerName });
    G[key].members[playerName] = groups.find((g) => g.group_id === G[key].id).member_id;
  }
  async function claim(key, user, playerName) {
    const preview = await call(user, 'previewGroupByCode', { invite_code: G[key].invite_code });
    const target = preview.unclaimed_players.find((p) => p.player_name === playerName);
    if (!target) throw new Error(`seed: ${playerName} is not an unclaimed player of ${key}`);
    await call(user, 'joinGroupByCode', { invite_code: G[key].invite_code, claim_member_id: target.id });
  }
  const memberId = (key, playerName) => {
    const id = G[key].members[playerName];
    if (!id) throw new Error(`seed: no player ${playerName} in ${key}`);
    return id;
  };
  async function note(key, author, about, text, { anonymous = false, session = null } = {}) {
    await call(author, 'createNote', {
      group_id: G[key].id,
      target_player_id: memberId(key, about),
      note: text,
      is_anonymous: anonymous,
      session_id: session ? G[key].sessions[session].id : undefined,
    });
    tally.notes += 1;
  }

  // One whole whist night, driven through startSession / startRound / submitBids / saveRoundResults / closeSession.
  // spec: { key, scorer, name, location, scoring, advanced, attendees, rounds, plants, gameLimit, script, leaveOpen, date }
  async function playSession(gkey, spec) {
    const g = G[gkey];
    const rng = makeRng(`whist-sandbox/session/${gkey}/${spec.key}`);
    const { session } = await call(spec.scorer, 'startSession', {
      group_id: g.id,
      name: spec.name,
      session_date: spec.date || ymd(clock.ms),
      location: spec.location,
      scoring_method: spec.scoring,
      advanced_rules_enabled: !!spec.advanced,
    });
    g.sessions[spec.key] = session;
    tally.sessions += 1;
    if (spec.gameLimit) {
      // No function and no screen sets game_limit (startSession always stores null) — written directly.
      await b.service.Session.update(session.id, { game_limit: spec.gameLimit });
    }
    const count = spec.script ? spec.script.length : spec.rounds;
    for (let n = 1; n <= count; n++) {
      const scripted = spec.script ? spec.script[n - 1] : null;
      const plant = (spec.plants && spec.plants[n]) || {};
      let names;
      let bids;
      let tricks;
      if (scripted) {
        ({ seats: names, bids, tricks } = scripted);
      } else {
        names = seatsFor(spec.attendees, n, [plant.zero?.who, plant.renege].filter(Boolean));
        ({ bids, tricks } = genRound(rng, names, plant));
      }
      const ids = names.map((name) => memberId(gkey, name));

      tick((1 + rng() * 2) * MIN);
      const { round } = await call(spec.scorer, 'startRound', { session_id: session.id, player_ids: ids });

      tick((1.5 + rng() * 2) * MIN);
      const bidBody = { game_id: round.id, bids: Object.fromEntries(ids.map((id, i) => [id, bids[i]])) };
      const withTrump = scripted ? !!scripted.trump : (!!spec.advanced || rng() < 0.4);
      if (withTrump) {
        const top = Math.max(...bids);
        const tied = ids.filter((_, i) => bids[i] === top); // equal numbers are settled by suit at the table
        bidBody.trump_suit = scripted?.trump || SUITS[Math.floor(rng() * SUITS.length)];
        bidBody.trump_owner_player_id = scripted?.trumpOwner ? memberId(gkey, scripted.trumpOwner) : tied[Math.floor(rng() * tied.length)];
        if (spec.advanced) bidBody.hierarchy = rng() < 0.75 ? 'standard' : 'down_up';
        tally.trump_records += 1;
      }
      await call(spec.scorer, 'submitBids', bidBody);
      if (scripted && !tricks) { tally.rounds_in_play += 1; continue; } // bids locked, hand still being played

      tick((6 + rng() * 5) * MIN);
      const reneges = plant.renege ? { [memberId(gkey, plant.renege)]: true } : {};
      const out = await call(spec.scorer, 'saveRoundResults', {
        game_id: round.id,
        tricks: Object.fromEntries(ids.map((id, i) => [id, tricks[i]])),
        reneges,
      });

      // Re-check what the function stored against the frontend's scoring engine.
      const expected = scoreRound({
        players: ids.map((id, i) => ({ player_id: id, bid: bids[i], tricks_won: tricks[i], reneged: !!reneges[id] })),
        scoringMethod: session.scoring_method,
      });
      const stored = await b.service.RoundResult.filter({ game_id: round.id });
      for (const want of expected.results) {
        const got = stored.find((r) => r.player_id === want.player_id);
        if (!got || got.points !== want.points) {
          warnings.push(`${g.name} / ${session.name} round ${n}: ${names[ids.indexOf(want.player_id)]} stored ${got?.points}, scoring.js says ${want.points}`);
        }
      }
      if (out.everyone_falls !== expected.everyoneFalls) {
        warnings.push(`${g.name} / ${session.name} round ${n}: everyone_falls stored ${out.everyone_falls}, scoring.js says ${expected.everyoneFalls}`);
      }
      if (!!plant.ef !== !!out.everyone_falls) throw new Error(`seed: round ${n} of ${spec.key} everyone-falls mismatch`);
      tally.rounds_scored += 1;
      if (out.everyone_falls) tally.everyone_falls += 1;
      if (plant.renege) tally.reneges += 1;
      bids.forEach((bid, i) => { if (bid === 0) tally[tricks[i] === 0 ? 'zero_bids_made' : 'zero_bids_failed'] += 1; });
    }
    if (spec.gameLimit) {
      // The limit is reached: the function itself must now refuse another round.
      const ids = spec.attendees.slice(0, 4).map((name) => memberId(gkey, name));
      tick(MIN);
      const refused = await call(spec.scorer, 'startRound', { session_id: session.id, player_ids: ids }, 409);
      if (!/limit/i.test(refused.error || '')) throw new Error(`seed: expected the game limit to refuse a round, got ${JSON.stringify(refused)}`);
    }
    if (!spec.leaveOpen) {
      tick(3 * MIN);
      await call(spec.scorer, 'closeSession', { session_id: session.id });
    }
  }

  // ---- the calendar ----
  // Thursday Whist meets on Thursdays: 14 nights over 19 weeks, the last one on the most recent
  // Thursday before today. Everything else hangs off the first of those nights (day0).
  const dow = new RealDate(anchor).getDay();
  const backToThursday = ((dow - 4 + 7) % 7) || 7;
  const WEEKS_BACK = [19, 17, 15, 14, 12, 11, 9, 8, 7, 5, 4, 2, 1, 0];
  const tw = WEEKS_BACK.map((w) => backToThursday + 7 * w); // days ago of each Thursday Whist night
  const day0 = tw[0];

  const events = [];
  const at = (ms, run) => events.push({ ms, run, order: events.length });
  const signUp = (key, ms) => at(ms, async () => {
    const def = SEED_USERS.find((u) => u.key === key);
    U[key] = b.createUser({ email: def.email, password: PASSWORD, full_name: def.full_name, role: def.role });
  });

  // -- accounts --
  signUp('root', local(day0 + 30, 9, 0));
  signUp('dan', local(day0 + 24, 18, 10));
  signUp('omer', local(day0 + 23, 20, 0));
  signUp('rachel', local(day0 + 22, 8, 30));
  signUp('noa', local(day0 + 14, 21, 15));
  signUp('maya', local(day0 + 13, 12, 0));
  signUp('google', local(day0 - 40, 11, 20));
  signUp('newbie', anchor - 180 * MIN); // signed up this evening, joined nothing yet

  // -- Old Crew: two nights, then archived --
  at(local(day0 + 20, 19, 0), async () => {
    await createGroup('oldcrew', 'dan', { name: 'Old Crew', description: 'The university gang.', player_name: 'Dan', scoring_method_default: 'classic' });
    tick(2 * MIN);
    await addGhost('oldcrew', 'dan', 'Gidi');
  });
  at(local(day0 + 19, 10, 0), () => joinAsNew('oldcrew', 'omer', 'Omer'));
  at(local(day0 + 19, 11, 30), () => joinAsNew('oldcrew', 'rachel', 'Rachel'));
  at(local(day0 + 18, 21, 0), () => playSession('oldcrew', {
    key: 'oc1', scorer: 'dan', name: 'Reunion', location: "Dan's old flat", scoring: 'classic', attendees: ['Dan', 'Omer', 'Rachel', 'Gidi'], rounds: 6,
  }));
  at(local(day0 + 11, 21, 0), () => playSession('oldcrew', {
    key: 'oc2', scorer: 'dan', name: 'One last time', location: "Dan's old flat", scoring: 'classic', attendees: ['Rachel', 'Gidi', 'Dan', 'Omer'], rounds: 7,
  }));
  at(local(day0 + 10, 9, 20), () => note('oldcrew', 'omer', 'Gidi', 'Gidi still owes us a rematch.', { session: 'oc2' }));
  at(local(day0 - 3, 9, 0), () => call('dan', 'setGroupStatus', { group_id: G.oldcrew.id, status: 'archived' }));

  // -- Office League: one lunch break, then soft-deleted --
  at(local(day0 + 15, 13, 0), async () => {
    await createGroup('office', 'rachel', { name: 'Office League', description: 'Lunch-break whist.', player_name: 'Rachel', scoring_method_default: 'classic' });
    for (const name of ['Tal', 'Shir', 'Ben']) { tick(MIN); await addGhost('office', 'rachel', name); }
  });
  at(local(day0 + 13, 12, 30), () => playSession('office', {
    key: 'of1', scorer: 'rachel', name: 'Lunch break', location: 'Kitchenette', scoring: 'classic', attendees: ['Rachel', 'Tal', 'Shir', 'Ben'], rounds: 4,
  }));
  at(local(day0 + 2, 16, 0), () => call('rachel', 'setGroupStatus', { group_id: G.office.id, status: 'deleted' }));

  // -- Family Table: progressive by default, 4 members, 3 nights, nothing open --
  at(local(day0 + 12, 20, 0), async () => {
    await createGroup('family', 'noa', { name: 'Family Table', description: 'שישי אצל סבא', player_name: 'נועה', scoring_method_default: 'progressive' });
    tick(2 * MIN);
    await addGhost('family', 'noa', 'אמא');
    tick(MIN);
    await addGhost('family', 'noa', 'סבא משה');
  });
  at(local(day0 + 11, 10, 0), () => joinAsNew('family', 'maya', 'Maya'));
  const FAMILY = ['נועה', 'Maya', 'אמא', 'סבא משה'];
  at(local(day0 - 10, 17, 0), () => playSession('family', {
    key: 'ft1', scorer: 'noa', name: 'שישי משפחתי', location: 'אצל סבא', attendees: FAMILY, rounds: 7,
    plants: { 4: { zero: { who: 'אמא', made: true, table: 'down' } } },
  }));
  at(local(day0 - 62, 17, 0), () => playSession('family', {
    key: 'ft2', scorer: 'maya', name: 'Holiday table', location: 'אצל סבא', attendees: FAMILY, rounds: 6, plants: { 3: { ef: true } },
  }));
  at(local(day0 - 63, 10, 15), () => note('family', 'noa', 'אמא', 'אמא לא מפסידה. אף פעם.', { session: 'ft2' }));
  at(local(day0 - 118, 17, 30), () => playSession('family', {
    key: 'ft3', scorer: 'noa', name: '', location: 'Home', attendees: FAMILY, rounds: 7,
  }));
  at(local(day0 - 119, 8, 45), () => note('family', 'maya', 'נועה', 'Hosts, deals, and still keeps score against us.', { anonymous: true }));

  // -- Thursday Whist --
  at(local(day0 + 6, 19, 0), async () => {
    await createGroup('thursday', 'maya', { name: 'Thursday Whist', description: 'Thursdays, 20:30. Bring snacks.', player_name: 'Maya', scoring_method_default: 'classic' });
    for (const name of ['יוסי', 'אבי', 'Omer']) { tick(2 * MIN); await addGhost('thursday', 'maya', name); }
  });
  at(local(day0 + 5, 8, 15), () => joinAsNew('thursday', 'dan', 'Dan'));
  at(local(day0 + 5, 21, 40), () => joinAsNew('thursday', 'noa', 'נועה'));
  // Omer played two nights as an unclaimed player, then claimed that player (his history came with it).
  at(local(tw[2] - 1, 9, 30), () => claim('thursday', 'omer', 'Omer'));
  at(local(tw[3] + 2, 18, 0), () => joinAsNew('thursday', 'rachel', 'Rachel'));

  const THURSDAYS = [
    { key: 's1', scorer: 'maya', name: 'Season opener', location: 'אצל מאיה', scoring: 'classic', attendees: ['Maya', 'Dan', 'נועה', 'יוסי'], rounds: 12,
      plants: { 9: { zero: { who: 'נועה', made: true, table: 'down' } } } },
    { key: 's2', scorer: 'dan', name: '', location: "Dan's balcony", scoring: 'classic', attendees: ['Maya', 'Dan', 'Omer', 'אבי', 'יוסי'], rounds: 10,
      plants: { 4: { renege: 'Dan' } } },
    { key: 's3', scorer: 'noa', name: 'ליל חמישי', location: 'אצל מאיה', scoring: 'progressive', attendees: ['Maya', 'נועה', 'Omer', 'יוסי', 'אבי'], rounds: 13,
      plants: { 7: { ef: true } } },
    { key: 's4', scorer: 'rachel', name: 'Rachel joins!', location: 'Cafe Nona', scoring: 'classic', attendees: ['Maya', 'Dan', 'Rachel', 'נועה', 'Omer'], rounds: 11,
      plants: { 6: { zero: { who: 'Rachel', made: true, table: 'up' } } } },
    { key: 's5', scorer: 'noa', name: 'Advanced rules trial', location: 'אצל נועה', scoring: 'classic', advanced: true, attendees: ['נועה', 'Dan', 'Maya', 'אבי'], rounds: 12,
      plants: { 3: { zero: { who: 'Dan', made: false, took: 2 } } } },
    { key: 's6', scorer: 'maya', name: 'Quick eight', location: '', scoring: 'classic', gameLimit: 8, attendees: ['Maya', 'Dan', 'Rachel', 'יוסי'], rounds: 9,
      plants: { 5: { ef: true } } },
    { key: 's7', scorer: 'omer', name: 'Marathon', location: "Omer's rooftop", scoring: 'progressive', attendees: ['Maya', 'Dan', 'נועה', 'Omer', 'Rachel', 'יוסי'], rounds: 14,
      plants: { 9: { renege: 'Omer' } } },
    { key: 's8', scorer: 'maya', name: '', location: 'אצל מאיה', scoring: 'classic', attendees: ['Maya', 'Omer', 'Rachel', 'אבי'], rounds: 11,
      plants: { 2: { zero: { who: 'אבי', made: false, took: 1 } } } },
    { key: 's9', scorer: 'dan', name: 'אחרי החג', location: 'אצל יוסי', scoring: 'progressive', attendees: ['יוסי', 'אבי', 'נועה', 'Dan', 'Maya'], rounds: 12,
      plants: { 7: { ef: true, renege: 'אבי' } } },
    { key: 's10', scorer: 'dan', name: 'Whist & pizza', location: "Dan's balcony", scoring: 'classic', attendees: ['Dan', 'Omer', 'Rachel', 'נועה'], rounds: 10 },
    { key: 's11', scorer: 'maya', name: 'ערב מתקדמים', location: 'Cafe Nona', scoring: 'progressive', advanced: true, attendees: ['Maya', 'נועה', 'Rachel', 'Omer', 'אבי'], rounds: 13,
      plants: { 8: { zero: { who: 'Maya', made: true, table: 'down' } } } },
    { key: 's12', scorer: 'maya', name: 'גשם בחוץ', location: 'אצל מאיה', scoring: 'classic', attendees: ['Maya', 'Dan', 'יוסי', 'אבי'], rounds: 11,
      plants: { 5: { zero: { who: 'יוסי', made: true, table: 'up' } } } },
    { key: 's13', scorer: 'rachel', name: 'Rematch', location: "Omer's rooftop", scoring: 'classic', attendees: ['Omer', 'Rachel', 'נועה', 'Maya', 'Dan'], rounds: 12,
      plants: { 10: { ef: true } } },
    { key: 's14', scorer: 'noa', name: 'Last Thursday', location: 'אצל נועה', scoring: 'progressive', attendees: ['נועה', 'Maya', 'Dan', 'Rachel'], rounds: 10,
      plants: { 4: { zero: { who: 'נועה', made: false, took: 3 } } } },
  ];
  THURSDAYS.forEach((spec, i) => at(local(tw[i], 20, 30 + (i % 3) * 5), () => playSession('thursday', spec)));

  // -- table talk in Thursday Whist: signed and anonymous, some pinned to a night --
  at(local(tw[0] - 1, 9, 10), () => note('thursday', 'dan', 'Maya', 'Opened the season with a made 5. Somebody stop her.', { session: 's1' }));
  at(local(tw[1] - 1, 8, 5), () => note('thursday', 'maya', 'Dan', 'Reneged on hearts and blamed the lighting.', { anonymous: true, session: 's2' }));
  at(local(tw[4] + 3, 19, 45), () => note('thursday', 'noa', 'יוסי', 'יוסי תמיד מכריז גבוה מדי כשיש לו אס'));
  at(local(tw[6] - 1, 10, 30), () => note('thursday', 'maya', 'Omer', 'Bids 2, takes 5. Every. Single. Time.', { session: 's7' }));
  at(local(tw[7] + 2, 13, 0), () => note('thursday', 'rachel', 'נועה', 'Counts trumps out loud. We can hear you.', { anonymous: true }));
  at(local(tw[8] - 1, 8, 0), () => note('thursday', 'omer', 'אבי', 'אבי הפיל את כולנו בסיבוב 7 — everyone falls, and a renege on top 😂', { session: 's9' }));
  at(local(tw[10] - 1, 7, 50), () => note('thursday', 'rachel', 'Maya', 'Zero bid, table DOWN, took nothing. +50. Respect.', { session: 's11' }));
  at(anchor - 120 * MIN, () => note('thursday', 'dan', 'Rachel', 'מי שמביאה עוגה מנצחת. זה לא הוגן.', { anonymous: true }));

  // -- today: one open session, three scored rounds, a fourth with bids locked and the hand in play --
  at(anchor - 75 * MIN, () => playSession('thursday', {
    key: 'open', scorer: 'maya', name: 'Midweek special', location: 'אצל מאיה', scoring: 'classic', leaveOpen: true, date: ymd(anchor),
    script: [
      { seats: ['Maya', 'Dan', 'נועה', 'יוסי'], bids: [3, 4, 2, 5], tricks: [3, 5, 2, 3] },
      { seats: ['Dan', 'נועה', 'יוסי', 'Maya'], bids: [2, 4, 3, 2], tricks: [2, 4, 4, 3], trump: 'spades', trumpOwner: 'נועה' },
      { seats: ['נועה', 'יוסי', 'Maya', 'Dan'], bids: [0, 5, 4, 3], tricks: [0, 6, 4, 3] },
      { seats: ['יוסי', 'Maya', 'Dan', 'נועה'], bids: [4, 3, 2, 5], tricks: null, trump: 'hearts', trumpOwner: 'נועה' },
    ],
  }));
  at(anchor - 6 * MIN, () => note('thursday', 'maya', 'Dan', 'Dan promised pizza tonight. We remember.', { session: 'open' }));

  // ---- run the calendar in order ----
  // Everything above is placed relative to either the first Thursday night or "now", so the ORDER of
  // events — and with it every generated id, token and invite code — is the same on any day of the week.
  events.sort((x, y) => x.ms - y.ms || x.order - y.order);
  clock.ms = events[0].ms - 1000;
  for (const event of events) {
    clock.ms = event.ms > clock.ms ? event.ms : clock.ms + 1000;
    await event.run();
  }
  if (clock.ms > anchor) warnings.push('the simulated clock ran a little past "now" (started just after midnight?) — the newest rows are dated slightly in the future');

  return {
    users: SEED_USERS.map((u) => ({ ...u, id: U[u.key].id })),
    groups: Object.fromEntries(Object.entries(G).map(([key, g]) => [key, { id: g.id, name: g.name }])),
    tally,
    warnings,
  };
}

// node sandbox/seed.mjs — seed an in-memory backend and print what is in it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createBackend } = await import('./backend.mjs');
  const backend = await createBackend({ seed });
  const summary = backend.state.seedSummary;
  console.log('rows:', backend.counts());
  console.log('tally:', summary.tally);
  for (const group of await backend.service.Group.list('created_date')) {
    const sessions = await backend.service.Session.filter({ group_id: group.id });
    const rounds = await backend.service.Game.filter({ group_id: group.id });
    const members = await backend.service.GroupMember.filter({ group_id: group.id }, 'created_date');
    console.log(`\n${group.name} [${group.status}] code ${group.invite_code} — ${sessions.length} sessions (${sessions.filter((s) => s.status === 'open').length} open), ${rounds.length} rounds`);
    console.log('  members:', members.map((m) => `${m.player_name}${m.role === 'admin' ? ' (admin)' : ''}${m.user_id ? '' : ' (unclaimed)'}`).join(', '));
  }
  console.log(summary.warnings.length ? `\nscoring mismatches:\n  ${summary.warnings.join('\n  ')}` : '\nevery scored round matches src/lib/scoring.js');
}
