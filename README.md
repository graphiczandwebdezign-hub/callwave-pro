# CallWave Pro — HD Voice Calls + Smart Voicemail

![Status](https://img.shields.io/badge/status-v2.1%20Sprint%201B-00a884) ![Node](https://img.shields.io/badge/node-%3E%3D18-black) ![WebRTC](https://img.shields.io/badge/WebRTC-HD%20Voice-00a884) ![License](https://img.shields.io/badge/license-MIT-blue)

> WhatsApp-quality voice calls with an intelligent answering machine. 48kHz
> Opus, noise suppression, and auto-voicemail when you miss a call.

**CallWave Pro v2.1** keeps all voice-calling functionality from v1 while
running on a clean, production-shaped modular architecture (Sprint 1A) with
optional Supabase persistence, cloud voicemail storage, Redis-backed token
revocation, and enforceable socket auth (Sprint 1B). Every production backend
is **optional** — leave the env vars blank and it runs on local JSON/files.

---

## ✨ Release history

**Sprint 1A** — modular architecture (`/config`, `/middleware`, `/services`, `/routes`, `/utils`),
repository-pattern data layer, `dotenv` config, JWT auth (`register`/`login`/`me`/`logout`),
prepared socket auth, structured logging, central error handling. Voice calls unchanged.

**Sprint 1B** — **Supabase** persistence (same repository interface, JSON fallback),
**cloud object storage** for voicemail audio (Supabase Storage / local FS),
**Redis**-backed token revocation, **enforceable** socket auth, and presence
mirroring — all credential-gated, so nothing breaks without them.

📖 See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/SPRINT-1A.md`](docs/SPRINT-1A.md), [`docs/SPRINT-1B.md`](docs/SPRINT-1B.md).

---

## 📂 Project structure

```
server.js              # Thin entry: middleware + routes + realtime, then listens
api/index.js           # Vercel serverless entry
config/                # Env-driven config (dotenv) — single source of truth
middleware/            # auth · errorHandler · notFound
services/              # dataService (factory) · userService · authService
                       # presenceService · callService · voicemailService
                       # socketService · storageService · tokenStore
services/repositories/ # jsonRepository · supabaseRepository · supabaseClient
routes/                # health · voicemail · history · auth
utils/                 # logger · AppError · asyncHandler
db/schema.sql          # Supabase tables, indexes, RLS, storage bucket
public/                # SPA client (unchanged — voice calls intact)
test/                  # signalling E2E · data-layer tests
data/                  # JSON collections (fallback; gitignored)
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
node test/signaling.test.js   # 11/11 WebRTC signalling + presence checks
```

Data-layer test (no server / no DB needed):

```bash
node test/dataLayer.test.js   # 16/16: factory selection, repo contract, field mapping
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
| `SOCKET_AUTH_REQUIRED` | `false` | Require JWT on socket connect   |
| `LOG_LEVEL`     | `debug`       | trace/debug/info/warn/error/fatal |
| `LOG_FORMAT`    | `pretty`      | `pretty` (dev) / `json` (prod)    |

> ⚠️ **Production fails fast** if `JWT_SECRET` is missing or still the placeholder.

### Optional production backends (Sprint 1B)

All optional — leave blank for local JSON/files/memory:

| Variable                   | When set, enables…                     |
|----------------------------|----------------------------------------|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Supabase Postgres persistence |
| `SUPABASE_ANON_KEY`        | (kept for future client-side use)      |
| `SUPABASE_STORAGE_BUCKET`  | Supabase Storage for voicemail audio   |
| `STORAGE_PROVIDER`         | `local` (default) / `supabase`         |
| `REDIS_URL`                | Shared (cross-instance) token revocation |
| `SOCKET_AUTH_REQUIRED`     | Reject unauthenticated socket connections |

To activate Supabase: create a project, run [`db/schema.sql`](db/schema.sql) in
the SQL editor, then set the env vars and restart. The boot log prints
`backend="supabase"` and `provider="supabase"`.

---

## 🏗 Architecture overview

```
Browser ──REST──► Express ──► services ──► dataService (factory) ──► Supabase | JSON
        ──WS────► socketService ──► presenceService (in-memory, mirrored to DB when on)
        uploads──► storageService ──► Supabase Storage | local FS
```

- **WebRTC media is P2P** between browsers; the server only relays signalling.
- **Backends are credential-gated:** Supabase / Storage / Redis activate only
  when configured, else fall back to JSON / local FS / in-memory. See
  `docs/ARCHITECTURE.md` §4 and `docs/SPRINT-1B.md`.

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

- ✅ **Sprint 1A** — modular architecture, config, auth, logging, data-layer swap point.
- ✅ **Sprint 1B** — Supabase persistence, cloud voicemail storage, Redis revocation, enforceable socket auth.
- **Sprint 1C** — Wire the SPA to auth (register/login UI, token on socket,
  per-user voicemail authorization, refresh tokens); TURN/STUN relay.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
