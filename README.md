# CallWave — HD Voice Calls + Smart Voicemail

A WhatsApp-like voice calling app focused on **quality** and **answering machine** flow.

## Features Built

### 🔊 HD Voice Quality
- **Opus 48kHz** codec with tuned SDP: `maxaveragebitrate=51000, useinbandfec=1, minptime=10`
- Browser constraints: `echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000`
- Live quality monitoring via `getStats()`: bitrate, packet loss, jitter, RTT, mic level
- Adaptive UI: Excellent/Good/Poor indicator
- Waveform visualizations for speaking

### 🤖 Smart Answering Machine (WhatsApp-like)
- If user is **offline**, **declines**, or **doesn't answer in 15 seconds**, caller is auto-routed to voicemail
- Recipient can choose **Send to Voicemail** (red phone button) on incoming screen
- Caller gets **Voicemail Recorder UI**:
  - 60s max recording
  - Real-time waveform (Web Audio analyser)
  - Opus WebM recording (smallest size, highest quality)
  - Preview & Send
- Voicemails stored on server `/public/uploads`
- Recipient gets **real-time notification** + badge + playable list
- Voicemail list shows listened/unlistened, duration, file info

### 📞 Core Calling
- WebRTC P2P with Google STUN servers
- Socket.IO signaling: offer/answer/ICE
- Call states: calling, ringing, ongoing, ended, missed, voicemail
- Mute toggle, call timer, end call
- Ringtone via WebAudio
- Call history persisted to JSON file

### 💬 UI - WhatsApp Inspired
- Login with username (no auth needed for demo - easily add JWT)
- Left sidebar: Contacts (online users), History, Voicemail with search
- Main: Empty state → Outgoing → Incoming overlay → Active call → Voicemail recorder
- Dark WhatsApp theme: #0b141a, #111b21, #00a884
- Fully responsive (mobile: sidebar hides on call)
- Toast notifications

## Architecture

```
Browser A  --Socket.IO-->  Node Server  --Socket.IO--> Browser B
   |                                              |
   |--------WebRTC P2P (STUN)---------------------|
   
Voicemail: MediaRecorder -> POST /api/upload-voicemail -> file system -> socket notify
```

- `server.js`: Express + Socket.IO, REST for voicemails/history, in-memory + JSON persistence
- `public/index.html`: Single file SPA (no build step), vanilla JS, inline CSS for preview compatibility

## Run Locally

```bash
cd voiceapp
npm install
npm start
# open http://localhost:3000 in TWO browser windows with different usernames (alice, bob) to test
```

## Testing Flow
1. Open localhost:3000, login as `alice`
2. Open incognito/second window, login as `bob`
3. In alice window, you see bob online → click to call
4. In bob window: Accept / Decline / Send to Voicemail
5. If bob doesn't answer 15s → alice auto goes to voicemail recorder
6. Record 5s, Send → bob instantly gets badge and can play
7. Check quality stats panel (top-right 📊 icon) during call

## Extending to Production
- **TURN server**: Add coturn for NAT traversal `turn:yourserver:3478`
- **Auth**: Add JWT + bcrypt, replace username map
- **PWA / Mobile**: Wrap with Capacitor / React Native WebRTC
- **Transcription**: Wire Whisper API on upload endpoint
- **Push Notifications**: FCM for background voicemail alerts
- **Storage**: Replace JSON file with Postgres/S3 for voicemails
- **E2E Encryption**: Use insertable streams for Opus frames

## Why High Quality?
- Force Opus mono (voice optimized) but 48kHz sampling
- FEC enabled for packet loss concealment
- EC/NS/AGC handled by browser + hardware
- Stats monitoring lets user see real quality

Enjoy! Built for Arena.
