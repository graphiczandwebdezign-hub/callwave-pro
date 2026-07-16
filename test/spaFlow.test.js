/**
 * Sprint 1C end-to-end test: simulates the authenticated SPA flow.
 * register/login -> socket auth -> presence -> authenticated voicemail fetch.
 * Run while the server is up on :3000.
 */
const { io } = require('socket.io-client');
const B = 'http://localhost:3000';

function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(B + path, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json());
}
function get(path, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(B + path, { headers });
}

const results = [];
const ok = (m) => { results.push(true); console.log('✅ ' + m); };
const bad = (m) => { results.push(false); console.log('❌ ' + m); };

(async () => {
  const stamp = Date.now();
  const ALICE = 'spa_alice_' + stamp;
  const BOB = 'spa_bob_' + stamp;
  const PW = 'secret123';

  // ---- register alice (as the SPA Register button would) ----
  let r = await post('/auth/register', { username: ALICE, password: PW });
  r.success && r.accessToken && r.refreshToken
    ? ok('SPA register -> user + accessToken + refreshToken')
    : bad('register failed: ' + (r.error || JSON.stringify(r)));
  const aliceAT = r.accessToken;

  // ---- /auth/me validates the session (as resumeSession would) ----
  r = await (await get('/auth/me', aliceAT)).json();
  r.user.username === ALICE ? ok('resumeSession /auth/me -> valid') : bad('me invalid');

  // ---- socket connects WITH the access token, presence works ----
  const alice = io(B, { transports: ['websocket'], auth: { token: aliceAT }, forceNew: true });
  await new Promise((res, rej) => { alice.on('connect', res); alice.on('connect_error', rej); });
  ok('SPA socket connected with auth token');

  const joined = new Promise((res) => alice.on('user:joined', res));
  alice.emit('user:join', { username: ALICE });
  await joined;
  ok('user:join -> user:joined ack (authenticated socket)');

  // ---- bob registers + joins ----
  r = await post('/auth/register', { username: BOB, password: PW });
  const bobAT = r.accessToken;
  const bob = io(B, { transports: ['websocket'], auth: { token: bobAT }, forceNew: true });
  await new Promise((res, rej) => { bob.on('connect', res); bob.on('connect_error', rej); });

  const aliceSeesBob = new Promise((res) => {
    alice.on('users:update', function h(users) {
      if (users.some((u) => u.username === BOB)) { alice.off('users:update', h); res(); }
    });
  });
  bob.emit('user:join', { username: BOB });
  await aliceSeesBob;
  ok('presence: alice sees bob online after both authenticated');

  // ---- full call signalling still works through authenticated sockets ----
  const bobIncoming = new Promise((res) => bob.on('call:incoming', res));
  const aliceOutgoing = new Promise((res) => alice.on('call:outgoing', res));
  alice.emit('call:initiate', { to: BOB, from: ALICE });
  const inc = await bobIncoming; await aliceOutgoing;
  inc.from === ALICE ? ok('call:initiate -> call:incoming (auth sockets)') : bad('call signalling broke');

  // ---- authenticated voicemail fetch works for own user ----
  const vh = await (await get('/api/voicemails/' + ALICE, aliceAT)).json();
  Array.isArray(vh) ? ok('authenticated voicemail fetch (own) -> array') : bad('voicemail fetch failed');

  // ---- refresh token flow (as doRefresh would) ----
  r = await post('/auth/refresh', {}, (await post('/auth/login', { username: ALICE, password: PW })).refreshToken);
  r.accessToken ? ok('doRefresh /auth/refresh -> new accessToken') : bad('refresh failed: ' + (r.error || ''));

  // ---- logout revokes + clears ----
  r = await post('/auth/logout', { refreshToken: (await post('/auth/login', { username: ALICE, password: PW })).refreshToken }, aliceAT);
  r.success ? ok('logout -> success') : bad('logout failed');

  alice.disconnect(); bob.disconnect();

  const passed = results.filter(Boolean).length;
  console.log('\n========================================');
  console.log(`SPRINT-1C SPA FLOW TEST: ${passed}/${results.length} checks passed`);
  console.log('========================================');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
