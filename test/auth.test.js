/**
 * Sprint 1C auth flow test: register / login / refresh / me / per-user
 * authorization / logout revocation. Run while the server is up on :3000.
 */
const B = 'http://localhost:3000';
const http = require('http');

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(B + path, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* */ }
        resolve({ status: res.statusCode, json, raw: buf });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const results = [];
const ok = (m) => { results.push(true); console.log('✅ ' + m); };
const bad = (m) => { results.push(false); console.log('❌ ' + m); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(`${m} (got ${a}, want ${b})`));

(async () => {
  const stamp = Date.now();
  const ALICE = 'alice1c_' + stamp;
  const BOB = 'bob1c_' + stamp;
  const PW = 'secret123';

  // register
  let r = await req('POST', '/auth/register', { body: { username: ALICE, password: PW } });
  eq(r.status, 201, 'register -> 201');
  r.json.user && r.json.accessToken && r.json.refreshToken
    ? ok('register returns user + accessToken + refreshToken')
    : bad('register missing token fields');
  r.json.token === r.json.accessToken ? ok('legacy `token` alias == accessToken') : bad('token alias mismatch');
  const aliceAT = r.json.accessToken;
  const aliceRT = r.json.refreshToken;

  // me with access
  r = await req('GET', '/auth/me', { token: aliceAT });
  eq(r.status, 200, 'me with access token -> 200');
  r.json.user.username === ALICE ? ok('me returns correct username') : bad('me wrong user');

  // me with refresh token must fail (tokenUse check)
  r = await req('GET', '/auth/me', { token: aliceRT });
  eq(r.status, 401, 'refresh token rejected as access (tokenUse) -> 401');

  // refresh
  r = await req('POST', '/auth/refresh', { token: aliceRT });
  eq(r.status, 200, 'refresh -> 200');
  const newAT = r.json && r.json.accessToken;
  newAT ? ok('refresh returns an access token') : bad('refresh returned no token');
  r = await req('GET', '/auth/me', { token: newAT });
  eq(r.status, 200, 'me with refreshed access token -> 200');

  // refresh with an access token must fail
  r = await req('POST', '/auth/refresh', { token: aliceAT });
  eq(r.status, 401, 'access token rejected as refresh -> 401');

  // bob registers + logs in
  await req('POST', '/auth/register', { body: { username: BOB, password: PW } });
  r = await req('POST', '/auth/login', { body: { username: BOB, password: PW } });
  eq(r.status, 200, 'login -> 200');
  const bobAT = r.json.accessToken;
  r.json.refreshToken ? ok('login returns refreshToken') : bad('login missing refreshToken');

  // per-user authorization
  r = await req('GET', '/api/history/' + ALICE, { token: aliceAT });
  eq(r.status, 200, 'alice reads own history -> 200');
  r = await req('GET', '/api/history/' + BOB, { token: aliceAT });
  eq(r.status, 403, 'alice reads bob history -> 403 (per-user authz)');
  r = await req('GET', '/api/history/' + ALICE); // anonymous
  eq(r.status, 200, 'anonymous reads history (legacy) -> 200');

  // logout revokes both
  r = await req('POST', '/auth/logout', { token: aliceAT, body: { refreshToken: aliceRT } });
  eq(r.status, 200, 'logout -> 200');
  r = await req('GET', '/auth/me', { token: aliceAT });
  eq(r.status, 401, 'me after logout (access revoked) -> 401');
  r = await req('POST', '/auth/refresh', { token: aliceRT });
  eq(r.status, 401, 'refresh after logout (refresh revoked) -> 401');

  const passed = results.filter(Boolean).length;
  console.log('\n========================================');
  console.log(`SPRINT-1C AUTH TEST: ${passed}/${results.length} checks passed`);
  console.log('========================================');
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
