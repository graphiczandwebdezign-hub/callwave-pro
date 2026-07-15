const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Ensure dirs
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// In-memory stores (with file persistence)
let users = {}; // socketId -> { id, username, online, lastSeen }
let usernameToSocket = {}; // username -> socketId
let callHistory = []; // { id, from, to, status, timestamp, duration }
let voicemails = []; // { id, from, to, file, timestamp, duration, listened, transcription }

const DATA_FILE = path.join(dataDir, 'store.json');
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      callHistory = data.callHistory || [];
      voicemails = data.voicemails || [];
    }
  } catch (e) { console.error('load failed', e); }
}
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ callHistory, voicemails }, null, 2));
  } catch (e) { console.error('save failed', e); }
}
loadData();

// Multer for voicemail
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop() || 'webm';
    cb(null, `vm_${Date.now()}_${uuidv4()}.${ext}`);
  }
});
const upload = multer({ storage });

// REST APIs
app.get('/api/stats', (req, res) => {
  res.json({
    online: Object.keys(users).length,
    users: Object.values(users).map(u => ({ username: u.username, online: u.online })),
    calls: callHistory.length,
    voicemails: voicemails.length
  });
});

app.get('/api/voicemails/:username', (req, res) => {
  const { username } = req.params;
  const list = voicemails.filter(v => v.to === username).sort((a,b) => b.timestamp - a.timestamp);
  res.json(list);
});

app.get('/api/history/:username', (req, res) => {
  const { username } = req.params;
  const list = callHistory.filter(c => c.from === username || c.to === username).sort((a,b) => b.timestamp - a.timestamp);
  res.json(list);
});

app.post('/api/upload-voicemail', upload.single('audio'), (req, res) => {
  const { from, to, duration } = req.body;
  if (!req.file || !from || !to) return res.status(400).json({ error: 'Missing data' });
  
  const vm = {
    id: uuidv4(),
    from,
    to,
    file: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    timestamp: Date.now(),
    duration: parseInt(duration) || 0,
    listened: false,
    transcription: `Voicemail from ${from}` // placeholder, could integrate Whisper API
  };
  voicemails.push(vm);
  callHistory.push({
    id: uuidv4(),
    from,
    to,
    status: 'voicemail',
    timestamp: Date.now(),
    duration: vm.duration
  });
  saveData();

  // Notify recipient if online
  const toSocket = usernameToSocket[to];
  if (toSocket) {
    io.to(toSocket).emit('voicemail:new', vm);
  }
  // Notify caller success
  res.json({ success: true, voicemail: vm });
});

app.post('/api/voicemail/:id/listened', (req, res) => {
  const vm = voicemails.find(v => v.id === req.params.id);
  if (vm) vm.listened = true;
  saveData();
  res.json({ success: true });
});

// Socket.IO Signaling
io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('user:join', ({ username }) => {
    username = username.trim().toLowerCase();
    if (!username) return;
    // Remove old socket for same username
    if (usernameToSocket[username]) {
      const oldSocket = usernameToSocket[username];
      delete users[oldSocket];
    }
    users[socket.id] = { id: socket.id, username, online: true, lastSeen: Date.now(), joinedAt: Date.now() };
    usernameToSocket[username] = socket.id;
    
    socket.username = username;
    console.log(`${username} joined`);
    
    // Broadcast online users
    io.emit('users:update', Object.values(users));
    socket.emit('user:joined', { username, id: socket.id });
  });

  socket.on('call:initiate', ({ to, from }) => {
    const toSocketId = usernameToSocket[to];
    const caller = users[socket.id];
    if (!toSocketId) {
      socket.emit('call:failed', { reason: 'User offline', to });
      // Suggest voicemail
      socket.emit('call:go-voicemail', { to, from, reason: 'offline' });
      return;
    }
    if (!caller) return;
    
    const callId = uuidv4();
    console.log(`Call ${callId}: ${from} -> ${to}`);
    
    io.to(toSocketId).emit('call:incoming', {
      callId,
      from,
      fromSocket: socket.id,
      to,
      timestamp: Date.now()
    });
    socket.emit('call:outgoing', { callId, to, from });
    
    callHistory.push({
      id: callId,
      from,
      to,
      status: 'initiated',
      timestamp: Date.now(),
      duration: 0
    });
    saveData();
  });

  socket.on('call:accept', ({ callId, to, from }) => {
    const callerSocketId = usernameToSocket[from];
    const receiverSocketId = usernameToSocket[to];
    // from is original caller, to is receiver (this socket)
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:accepted', { callId, by: to });
    }
    // Update history
    const call = callHistory.find(c => c.id === callId);
    if (call) call.status = 'ongoing';
    saveData();
  });

  socket.on('call:reject', ({ callId, to, from, sendToVoicemail }) => {
    const callerSocketId = usernameToSocket[from];
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:rejected', { 
        callId, 
        by: to,
        goVoicemail: !!sendToVoicemail
      });
      if (sendToVoicemail) {
        io.to(callerSocketId).emit('call:go-voicemail', { to, from, reason: 'declined' });
      }
    }
    const call = callHistory.find(c => c.id === callId);
    if (call) call.status = sendToVoicemail ? 'voicemail_pending' : 'rejected';
    
    if (!sendToVoicemail) {
      callHistory.push({
        id: uuidv4(),
        from,
        to,
        status: 'missed',
        timestamp: Date.now(),
        duration: 0
      });
    }
    saveData();
  });

  socket.on('call:end', ({ callId, from, to, duration }) => {
    const otherUsername = socket.username === from ? to : from;
    const otherSocketId = usernameToSocket[otherUsername];
    if (otherSocketId) {
      io.to(otherSocketId).emit('call:ended', { callId, by: socket.username, duration });
    }
    const call = callHistory.find(c => c.id === callId);
    if (call) {
      call.status = 'ended';
      call.duration = duration || 0;
      call.endedAt = Date.now();
    } else {
      callHistory.push({
        id: callId || uuidv4(),
        from, to,
        status: 'ended',
        timestamp: Date.now(),
        duration: duration || 0
      });
    }
    saveData();
  });

  socket.on('call:missed-timeout', ({ callId, from, to }) => {
    const callerSocketId = usernameToSocket[from];
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:go-voicemail', { to, from, callId, reason: 'timeout' });
    }
    const call = callHistory.find(c => c.id === callId);
    if (call) call.status = 'missed_timeout';
    callHistory.push({
      id: uuidv4(),
      from, to,
      status: 'missed',
      timestamp: Date.now(),
      duration: 0
    });
    saveData();
  });

  // WebRTC signaling
  socket.on('webrtc:offer', ({ to, offer, callId }) => {
    const toSocketId = usernameToSocket[to];
    if (toSocketId) io.to(toSocketId).emit('webrtc:offer', { from: socket.username, offer, callId });
  });

  socket.on('webrtc:answer', ({ to, answer, callId }) => {
    const toSocketId = usernameToSocket[to];
    if (toSocketId) io.to(toSocketId).emit('webrtc:answer', { from: socket.username, answer, callId });
  });

  socket.on('webrtc:ice-candidate', ({ to, candidate, callId }) => {
    const toSocketId = usernameToSocket[to];
    if (toSocketId) io.to(toSocketId).emit('webrtc:ice-candidate', { from: socket.username, candidate, callId });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      console.log(`${user.username} disconnected`);
      delete usernameToSocket[user.username];
      delete users[socket.id];
      io.emit('users:update', Object.values(users));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ CallWave HD Voice Server running on http://localhost:${PORT}`);
  console.log(`   - HD Voice Calls (Opus 48kHz, EC, NS, AGC)`);
  console.log(`   - Smart Answering Machine`);
  console.log(`   - Real-time stats & quality monitoring\n`);
});
