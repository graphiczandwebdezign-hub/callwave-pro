# CallWave Pro — HD Voice Calls + Smart Voicemail

![Status](https://img.shields.io/badge/status-v2.0%20Sprint%201A-00a884) ![Node](https://img.shields.io/badge/node-%3E%3D18-black) ![WebRTC](https://img.shields.io/badge/WebRTC-HD%20Voice-00a884) ![License](https://img.shields.io/badge/license-MIT-blue)

> WhatsApp-quality voice calls with an intelligent answering machine. 48kHz
> Opus, noise suppression, and auto-voicemail when you miss a call.

**CallWave Pro v2.0** keeps all voice-calling functionality from v1 while
introducing a clean, production-shaped modular architecture, environment
configuration, JWT authentication, structured logging, and a data layer that is
ready to drop in Supabase.

---

## ✨ What's new in v2.0 (Sprint 1A)

- **Modular architecture** — `/config`, `/middleware`, `/services`, `/routes`, `/utils`
- **Swappable data layer** — repository pattern (`dataService`); Supabase is a Sprint 1B swap-in
- **Environment config** — `dotenv` + `.env.example`; secrets out of code
- **Authentication** — `register` / `login` / `me` / `logout` (JWT + bcrypt)
- **Prepared socket auth** — authenticated connections without breaking signalling
- **Structured logging** — JSON in prod, pretty in dev; no more bare `console.log`
- **Central error handling** — uniform `{ error, code }` responses
- **Voice calls unchanged** — same WebRTC signalling & UX

📖 See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/SPRINT-1A.md`](docs/SPRINT-1A.md).

---

## 📂 Project structure

```
server.js              # Thin entry: middleware + routes + realtime, then listens
api/index.js           # Vercel serverless entry
config/                # Env-driven config (dotenv) — single source of truth
middleware/            # auth · errorHandler · notFound
services/              # dataService · userService · authService · presenceService
                       # callService · voicemailService · socketService
routes/                # health · voicemail · history · auth
utils/                 # logger · AppError · asyncHandler
public/                # SPA client (unchanged — voice calls intact)
test/                  # signalling + socket-auth E2E test
data/                  # JSON collections (gitignored)
```

---

## 🚀 Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   → set JWT_SECRET to a long random string (see note below)

# 3. Run
npm start          # production
# npm run dev      # auto-reload (nodemon)

# 4. Open http://localhost:3000 in TWO browser windows (alice / bob) to test calls
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 🔐 Authentication API

| Method & path          | Auth   | Body / Header            | Returns                       |
|------------------------|--------|--------------------------|-------------------------------|
| `POST /auth/register`  | —      | `{ username, password }` | `201 { success, user, token }`|
| `POST /auth/login`     | —      | `{ username, password }` | `200 { success, user, token }`|
| `GET  /auth/me`        | Bearer | `Authorization` header   | `200 { success, user }`       |
| `POST /auth/logout`    | Bearer | `Authorization` header   | `200 { success }` (revokes)   |

Validation rules: username ≥ 2 chars, password ≥ 6 chars.

---

## 📞 Existing APIs (unchanged)

| Method & path                          | Purpose                       |
|----------------------------------------|-------------------------------|
| `GET  /api/health`                     | Health / readiness probe      |
| `GET  /api/stats`                      | Online users, call/vm counts  |
| `GET  /api/voicemails/:username`       | Voicemails for a user         |
| `POST /api/upload-voicemail`           | Upload a voicemail (multipart)|
| `POST /api/voicemail/:id/listened`     | Mark voicemail heard          |
| `GET  /api/history/:username`          | Call history for a user       |

---

## 🧪 Testing

Automated end-to-end signalling test (start the server first):

```bash
npm start &
node test/signaling.test.js
```

It spins up two clients and walks the full call flow — join, initiate,
incoming/outgoing, accept, WebRTC offer/answer/ICE relay, end, and disconnect
cleanup — plus presence updates.

---

## 🎛 Configuration

All settings are environment-driven (see [`.env.example`](.env.example)):

| Variable        | Default (dev) | Description                       |
|-----------------|---------------|-----------------------------------|
| `NODE_ENV`      | `development` | `development` / `production`      |
| `PORT`          | `3000`        | HTTP port                         |
| `CORS_ORIGIN`   | `*`           | Allowed origins                   |
| `JWT_SECRET`    | — (required)  | Token signing secret              |
| `JWT_EXPIRES_IN`| `7d`          | Token lifetime                    |
| `BCRYPT_ROUNDS` | `10`          | Password hashing cost             |
| `LOG_LEVEL`     | `debug`       | trace/debug/info/warn/error/fatal |
| `LOG_FORMAT`    | `pretty`      | `pretty` (dev) / `json` (prod)    |

> ⚠️ **Production fails fast** if `JWT_SECRET` is missing or still the placeholder.

---

## 🏗 Architecture overview

```
Browser ──REST──► Express ──► services ──► dataService (repositories)
        ──WS────► socketService ──► presenceService (in-memory)
                                          │
                            (WebRTC media stays peer-to-peer)
```

- **WebRTC media is P2P** between browsers; the server only relays signalling.
- **The data layer is the Supabase swap point** — implement the same repository
  interface and no other file changes. See `docs/ARCHITECTURE.md` §4.

---

## ☁️ Deployment

A persistent Socket.IO host is best for reliable calls (Render / Fly / Railway).
Vercel works for the REST + static layer but has WebSocket caveats.

- **Render** — uses `render.yaml` (health check `/api/health`); set env vars in the dashboard.
- **Fly.io** — `jnb` (Johannesburg) region gives best latency from Durban.
- **Vercel** — `api/index.js` is the entry; `/tmp` is used for uploads/data.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for full instructions.

---

## 🔭 Roadmap

- **Sprint 1B** — Supabase persistence; S3/R2 voicemail storage; enforce socket
  auth; Redis token revocation.
- **Sprint 1C** — Wire the SPA to auth (register/login UI, token on socket,
  per-user voicemail authorization, refresh tokens).

---

## 📄 License

MIT — see [LICENSE](LICENSE).
