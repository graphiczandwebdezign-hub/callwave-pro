# Deployment Guide - CallWave HD Voice

This app is a **persistent Socket.IO server** - best deployed on platforms that support long-lived WebSocket connections.

## Option 1: Test Locally (Fastest, 100% works)

```bash
cd voiceapp
npm install
npm start
# open http://localhost:3000
```

Open **2 browser windows** (normal + incognito) with different usernames: `alice` and `bob`
- alice calls bob, bob accepts
- Test voicemail: don't answer for 15s or click red phone to send to voicemail

## Option 2: Render.com (Recommended for production, FREE)

Render supports persistent Node servers perfectly for Socket.IO.

1. Push to GitHub (already done: https://github.com/graphiczandwebdezign-hub/callwave-hd-voice)
2. Go to https://dashboard.render.com/
3. New + → Web Service → Connect your GitHub repo `callwave-hd-voice`
4. Settings:
   - Build: `npm install`
   - Start: `node server.js`
   - Health check: `/api/health`
5. Deploy → You get URL like `https://callwave-hd-voice.onrender.com`
6. Open that URL in 2 devices/browsers and test!

Uses `render.yaml` already in repo - Render will auto-detect.

## Option 3: Railway.app (Also great for Socket.IO)

1. https://railway.app → New Project → Deploy from GitHub
2. Select your repo
3. It auto-detects Node, sets PORT, deploys
4. Get public URL

## Option 4: Vercel (Possible but with caveats)

Vercel is serverless, Socket.IO on serverless is tricky:

- WebSockets may disconnect after 10s (serverless function timeout)
- Uploads are ephemeral (use /tmp)
- Our code now handles Vercel env (`process.env.VERCEL`)

**Deploy to Vercel:**

```bash
npm i -g vercel
cd voiceapp
vercel --prod
# Follow prompts, link to project
```

Or via GitHub import:
1. https://vercel.com/new → Import `callwave-hd-voice`
2. Framework: Other, Build: none, Output: public
3. Deploy

**Limitation:** For reliable calls, use polling transport or deploy Socket.IO signaling elsewhere. For demo/testing local or Render is better.

We included `vercel.json` and Vercel-compatible `server.js` (exports app, uses /tmp for uploads).

## Option 5: Fly.io (Excellent for WebSockets, globally close to Durban/JHB)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
fly auth login
cd voiceapp
fly launch --no-deploy
# Choose region: jnb (Johannesburg) closest to Durban!
fly deploy
```

## Testing Checklist

- [ ] 2 users online shows in contacts
- [ ] Call connects, timer starts, HD indicator green
- [ ] Mute/unmute works
- [ ] Stats panel (📊) shows bitrate, jitter, RTT
- [ ] No answer 15s → voicemail recorder appears
- [ ] Record 5s voicemail → Send → receiver gets badge + can play
- [ ] Call history shows ended/missed/voicemail
- [ ] Offline user → immediate voicemail prompt

## Durban/JHB latency tip

Deploy to region closest to you:
- Render: Singapore or Frankfurt (no SA region, but Singapore ~180ms from Durban)
- Fly.io: `jnb` (Johannesburg) - best latency ~10-30ms from Durban!
- Vercel: `sin1` (Singapore) or `fra1` (Frankfurt)
