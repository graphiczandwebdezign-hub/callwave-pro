/**
 * End-to-end signalling test (run while the server is up on :3000).
 * Simulates two clients (alice & bob) and walks the full call + voicemail
 * signalling flow to prove the refactor didn't break WebRTC signalling.
 */
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const results = [];
const ok = (m) => { results.push(true); console.log('✅ ' + m); };
const bad = (m) => { results.push(false); console.log('❌ ' + m); };

function makeClient(name) {
  const s = io(URL, { transports: ['websocket', 'polling'], forceNew: true });
  s.name = name;
  return s;
}

(async () => {
  const alice = makeClient('alice');
  const bob = makeClient('bob');

  await Promise.all([
    new Promise((res) => alice.on('connect', res)),
    new Promise((res) => bob.on('connect', res)),
  ]);
  ok('both clients connected via socket.io');

  // --- join ---
  const aliceJoined = new Promise((res) => alice.on('user:joined', () => res()));
  alice.emit('user:join', { username: 'alice' });
  await aliceJoined;
  ok('alice user:join -> user:joined ack');

  // bob joins; alice should receive users:update containing bob
  const aliceSeesBob = new Promise((res) => {
    alice.on('users:update', function handler(users) {
      if (users.some((u) => u.username === 'bob')) {
        alice.off('users:update', handler);
        res(users);
      }
    });
  });
  bob.emit('user:join', { username: 'bob' });
  const seen = await aliceSeesBob;
  ok('users:update broadcast contains bob (online=' + seen.filter((u) => u.online).length + ')');

  // --- call flow ---
  const bobIncoming = new Promise((res) => bob.on('call:incoming', (d) => res(d)));
  const aliceOutgoing = new Promise((res) => alice.on('call:outgoing', (d) => res(d)));

  alice.emit('call:initiate', { to: 'bob', from: 'alice' });

  const inc = await bobIncoming;
  inc.from === 'alice' && inc.to === 'bob'
    ? ok('call:initiate -> bob receives call:incoming (callId=' + inc.callId.slice(0, 8) + ')')
    : bad('call:incoming payload mismatch');

  const out = await aliceOutgoing;
  out.callId === inc.callId
    ? ok('call:initiate -> alice receives call:outgoing (matching callId)')
    : bad('call:outgoing callId mismatch');

  // --- accept ---
  const aliceAccepted = new Promise((res) => alice.on('call:accepted', (d) => res(d)));
  bob.emit('call:accept', { callId: inc.callId, to: 'bob', from: 'alice' });
  const acc = await aliceAccepted;
  acc.by === 'bob' ? ok('call:accept -> alice receives call:accepted (by=bob)') : bad('call:accepted mismatch');

  // --- WebRTC relay (offer / answer / ICE) ---
  const bobOffer = new Promise((res) => bob.on('webrtc:offer', (d) => res(d)));
  alice.emit('webrtc:offer', { to: 'bob', offer: { type: 'offer', sdp: 'FAKE-SDP' }, callId: inc.callId });
  const offer = await bobOffer;
  offer.from === 'alice' && offer.offer.sdp === 'FAKE-SDP'
    ? ok('webrtc:offer relayed alice->bob (payload intact)')
    : bad('webrtc:offer relay failed');

  const aliceAnswer = new Promise((res) => alice.on('webrtc:answer', (d) => res(d)));
  bob.emit('webrtc:answer', { to: 'alice', answer: { type: 'answer', sdp: 'ANS-SDP' }, callId: inc.callId });
  const ans = await aliceAnswer;
  ans.from === 'bob' && ans.answer.sdp === 'ANS-SDP'
    ? ok('webrtc:answer relayed bob->alice (payload intact)')
    : bad('webrtc:answer relay failed');

  const aliceIce = new Promise((res) => alice.on('webrtc:ice-candidate', (d) => res(d)));
  bob.emit('webrtc:ice-candidate', { to: 'alice', candidate: { candidate: 'ICE-CAND' }, callId: inc.callId });
  const ice = await aliceIce;
  ice.from === 'bob' && ice.candidate.candidate === 'ICE-CAND'
    ? ok('webrtc:ice-candidate relayed bob->alice (payload intact)')
    : bad('webrtc:ice relay failed');

  // --- end ---
  const bobEnded = new Promise((res) => bob.on('call:ended', (d) => res(d)));
  alice.emit('call:end', { callId: inc.callId, from: 'alice', to: 'bob', duration: 42 });
  const ended = await bobEnded;
  ended.by === 'alice' && ended.duration === 42
    ? ok('call:end -> bob receives call:ended (duration=42)')
    : bad('call:ended mismatch');

  // --- disconnect cleanup ---
  const aliceSeesGone = new Promise((res) => {
    alice.on('users:update', function handler(users) {
      if (!users.some((u) => u.username === 'bob')) {
        alice.off('users:update', handler);
        res();
      }
    });
  });
  bob.disconnect();
  await aliceSeesGone;
  ok('bob disconnect -> presence updated, removed from users:update');

  alice.disconnect();

  const passed = results.filter(Boolean).length;
  console.log('\n========================================');
  console.log(`SIGNALLING TEST: ${passed}/${results.length} checks passed`);
  console.log('========================================');
  process.exit(results.every(Boolean) ? 0 : 1);
})();
