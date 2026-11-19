// node src/lib/authReturnTo.test.mjs
//
// The return address after sign-in comes from the address bar, so the checks that keep it
// on this site are worth pinning: a regression here is an open redirect.
import assert from 'node:assert/strict';

const ORIGIN = 'https://whist.example';
const store = new Map();
globalThis.window = {
  location: { origin: ORIGIN, href: `${ORIGIN}/session/abc123?access_token=secret`, search: '' },
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  },
};

const {
  safeReturnPath, pendingReturnTo, consumeReturnTo, rememberReturnTo, forgetReturnTo,
  withReturnTo, inviteFromPath, inviteLink, BOOT_PATH, DEFAULT_AFTER_SIGN_IN,
} = await import('./authReturnTo.js');

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (err) { failed += 1; console.error(`FAIL ${name}\n  ${err.message}`); }
};

check('a path on this site is kept, query and hash included', () => {
  // (the query is written out again after the bootstrap parameters are stripped, so a
  // space comes back as "+" — the same value once it is read)
  assert.equal(safeReturnPath('/join?code=NHUA1B&name=Thursday%20Whist'), '/join?code=NHUA1B&name=Thursday+Whist');
  assert.deepEqual(inviteFromPath(safeReturnPath('/join?code=NHUA1B&name=Thursday%20Whist')), { code: 'NHUA1B', name: 'Thursday Whist' });
  assert.equal(safeReturnPath('/player/p1#notes'), '/player/p1#notes');
  assert.equal(safeReturnPath(`${ORIGIN}/session/abc123`), '/session/abc123');
});

check('another site is never followed, however it is spelled', () => {
  for (const raw of [
    'https://evil.example/join', '//evil.example/join', '/\\evil.example', '\\\\evil.example',
    '/.//evil.example', '/%2e//evil.example', 'javascript:alert(1)', 'data:text/html,hi',
    'https://whist.example.evil.example/', 'https://whist.example@evil.example/', '  //evil.example',
  ]) {
    const path = safeReturnPath(raw);
    assert.ok(path === null || (path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')), `${raw} -> ${path}`);
    if (path !== null) {
      // whatever survived must still resolve to this origin when it is navigated to
      assert.equal(new URL(path, ORIGIN).origin, ORIGIN, `${raw} -> ${path}`);
    }
  }
  assert.equal(safeReturnPath('https://evil.example/join'), null);
  assert.equal(safeReturnPath('//evil.example/join'), null);
  assert.equal(safeReturnPath('/.//evil.example'), null);
});

check("the platform's own endpoints are not a destination", () => {
  assert.equal(safeReturnPath('/api/apps/auth/logout?from_url=https://evil.example'), null);
  assert.equal(safeReturnPath('/api'), null);
});

check('sign-in pages and the public pages are not a destination', () => {
  for (const page of ['/', '/home', '/about', '/login', '/register', '/forgot-password', '/reset-password?token=x', '/login/']) {
    assert.equal(safeReturnPath(page), null, page);
  }
});

check('bootstrap parameters are stripped from the destination', () => {
  assert.equal(
    safeReturnPath('/join?code=ABC123&access_token=stolen&app_id=other&from_url=/x&is_new_user=true'),
    '/join?code=ABC123');
});

check('nothing, or nonsense, is no destination', () => {
  for (const raw of [null, undefined, '', 42, {}]) assert.equal(safeReturnPath(raw), null);
});

check('the address the page load started on is noted without its token', () => {
  assert.equal(BOOT_PATH, '/session/abc123');
});

check('from_url wins, returnTo is read too, then the remembered address', () => {
  forgetReturnTo();
  assert.equal(pendingReturnTo('?from_url=%2Fjoin%3Fcode%3DABC123'), '/join?code=ABC123');
  assert.equal(pendingReturnTo('?returnTo=%2Fround%2Fr1'), '/round/r1');
  assert.equal(pendingReturnTo('?from_url=https%3A%2F%2Fevil.example%2F'), null);
  assert.equal(rememberReturnTo('/session/s1'), '/session/s1');
  assert.equal(pendingReturnTo(''), '/session/s1');
  assert.equal(pendingReturnTo('?from_url=%2Fjoin%3Fcode%3DABC123'), '/join?code=ABC123');
});

check('an unsafe address is not remembered, and a stale one is dropped', () => {
  forgetReturnTo();
  assert.equal(rememberReturnTo('https://evil.example/'), null);
  assert.equal(pendingReturnTo(''), null);
  store.set('whistmate_return_to', JSON.stringify({ path: '/session/s1', at: Date.now() - 2 * 60 * 60 * 1000 }));
  assert.equal(pendingReturnTo(''), null);
  store.set('whistmate_return_to', JSON.stringify({ path: '//evil.example', at: Date.now() }));
  assert.equal(pendingReturnTo(''), null);
  store.set('whistmate_return_to', 'not json');
  assert.equal(pendingReturnTo(''), null);
});

check('consuming gives the address once, then the groups list', () => {
  forgetReturnTo();
  rememberReturnTo('/session/s1');
  assert.equal(consumeReturnTo(''), '/session/s1');
  assert.equal(consumeReturnTo(''), DEFAULT_AFTER_SIGN_IN);
  assert.equal(consumeReturnTo('?from_url=https%3A%2F%2Fevil.example%2F'), DEFAULT_AFTER_SIGN_IN);
});

check('links into the auth pages carry only a safe address', () => {
  assert.equal(withReturnTo('/login', '/join?code=ABC123'), '/login?from_url=%2Fjoin%3Fcode%3DABC123');
  assert.equal(withReturnTo('/register', 'https://evil.example/'), '/register');
  assert.equal(withReturnTo('/login', null), '/login');
});

check('an invite link is read as a code and a display name', () => {
  assert.deepEqual(inviteFromPath('/join?code=nhua1b&name=Thursday%20Whist'), { code: 'NHUA1B', name: 'Thursday Whist' });
  assert.deepEqual(inviteFromPath('/join?code=NHUA1B&name=Thursday+Whist'), { code: 'NHUA1B', name: 'Thursday Whist' });
  assert.deepEqual(inviteFromPath('/join'), { code: '', name: '' });
  assert.equal(inviteFromPath('/session/s1'), null);
  assert.equal(inviteFromPath(null), null);
  const long = inviteFromPath(`/join?code=ABC123&name=${'x'.repeat(200)}`);
  assert.equal(long.name.length, 60);
  assert.equal(inviteFromPath('/join?code=AB<script>&name=a%0Ab').code, 'ABSCRIPT');
  assert.equal(inviteFromPath('/join?code=ABC123&name=a%0Ab').name, 'a b');
});

check('the shared link carries the group name and reads back the same', () => {
  const link = inviteLink({ invite_code: 'NHUA1B', name: 'Thursday Whist' });
  assert.equal(link, `${ORIGIN}/join?code=NHUA1B&name=Thursday%20Whist`);
  const hebrew = inviteLink({ invite_code: 'ABC123', name: 'ליל חמישי & חברים' });
  assert.deepEqual(inviteFromPath(hebrew.slice(ORIGIN.length)), { code: 'ABC123', name: 'ליל חמישי & חברים' });
  assert.equal(inviteLink({ invite_code: 'ABC123', name: '' }), `${ORIGIN}/join?code=ABC123`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
