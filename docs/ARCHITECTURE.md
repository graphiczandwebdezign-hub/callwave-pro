# CallWave Pro — Architecture

> Status after **Sprint 1C**: modular, production-shaped backend + fully
> authenticated SPA. Voice calling is unchanged; auth (JWT + refresh tokens),
> config, structured logging, a swappable data layer (Supabase optional), and
> per-user authorization are all in place.

---

## 1. High-level flow

```
Browser (SPA, public/index.html)
   │  REST (voicemail / history / auth)        Socket.IO (signalling + presence)
   ▼                                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Express app  (server.js — thin composition layer)             │
│   middleware: cors · json · request-log · optionalAuth        │
│   routes:     /api/*   /auth/*    SPA fallback                │
│   error handling: notFound · errorHandler                     │
└──────────────┬──────────────────────────────┬─────────────────┘
               │ REST                          │ realtime
               ▼                               ▼
┌──────────────────────┐           ┌──────────────────────────┐
│ Services             │           │ socketService            │
│  voicemailService    │           │  (permissive auth middleware)
│  callService         │◄──────────│  presence + signalling   │
│  authService         │  notify   │  WebRTC relay            │
│  userService         │           └──────────────────────────┘
│  presenceService     │                      │
└─────────┬────────────┘                      │
          │ all persistence                   │
          ▼                                   ▼
┌──────────────────────┐           ┌──────────────────────────┐
│ dataService          │           │ presenceService          │
│  JsonRepository ×3   │           │  in-memory online users  │
│  accounts / calls /  │           │  (ephemeral, never saved)│
│  voicemails          │           └──────────────────────────┘
└──────────────────────┘
   ▲ swap this layer for Supabase in Sprint 1B (same interface)
```

WebRTC media itself is **peer-to-peer** between browsers; the server only relays
signalling (offer / answer / ICE) over Socket.IO — exactly as in v1.

---

## 2. Directory structure

```
callwave-pro/
├── server.js              # Thin entry: wires middleware + routes + realtime, then listens
├── api/index.js           # Vercel serverless entry (delegates to server.js)
├── config/
│   └── index.js           # Single source of truth for env-driven config (dotenv)
├── middleware/
│   ├── auth.js            # authenticate (required) + optionalAuth (permissive)
│   ├── errorHandler.js    # Central JSON error responses + structured logging
│   └── notFound.js        # 404 handler
├── services/
│   ├── dataService.js     # Modular data layer (JsonRepository) ← Sprint 1B swap point
│   ├── userService.js     # Accounts + bcrypt password hashing
│   ├── authService.js     # Register/login, JWT issue+verify, token revocation
│   ├── presenceService.js # In-memory online users + username→socket map
│   ├── callService.js     # Call-history persistence
│   ├── voicemailService.js# Voicemail persistence
│   └── socketService.js   # Socket.IO setup + all signalling handlers
├── routes/
│   ├── index.js           # Mounts all routers + global optionalAuth
│   ├── health.js          # GET /api/health, GET /api/stats
│   ├── voicemail.js       # /api/voicemails, /api/upload-voicemail, /api/voicemail/:id/listened
│   ├── history.js         # GET /api/history/:username
│   └── auth.js            # POST /auth/register|login|logout, GET /auth/me
├── utils/
│   ├── logger.js          # Structured logger (JSON prod / pretty dev)
│   ├── AppError.js        # Operational error with status code
│   └── asyncHandler.js    # Catches async route rejections
├── public/                # SPA (unchanged — voice calls intact)
│   └── index.html
├── data/                  # JSON collections (gitignored)
└── test/
    └── signaling.test.js  # E2E signalling + auth-socket checks
```

---

## 3. Layer responsibilities & dependency rules

| Layer        | May depend on            | May NOT depend on        |
|--------------|--------------------------|--------------------------|
| `utils/`     | `config/`                | services, routes         |
| `config/`    | (env only)               | everything else          |
| `services/`  | `utils/`, `config/`, other services | routes, server, middleware |
| `middleware/`| `services/`, `utils/`, `config/`   | routes, server           |
| `routes/`    | `services/`, `middleware/`, `utils/` | — (mounted by server) |
| `server.js`  | everything               | —                        |

Dependencies point **inward**: utilities and config have no knowledge of the
app; services contain business logic; routes/middleware are thin adapters;
`server.js` is the only composition root. This keeps the core testable and
backend-swappable.

---

## 4. The data layer (factory + pluggable backends)

`services/dataService.js` is a **factory** that exposes three repositories —
`accounts`, `calls`, `voicemails` — each implementing the same async interface:

```
all() · find(predicate) · findOne(predicate) · findById(id)
insert(doc) · updateById(id, patch) · removeById(id)
```

At startup it picks the backend:

- **Supabase configured** → `SupabaseRepository` (`services/repositories/`)
  talking to Postgres via the service-role client.
- **otherwise** → `JsonRepository` (a file per collection in `data/`).

Because every consumer calls `db.<collection>.<method>()`, **no caller knows or
cares which backend is active** — the swap is fully transparent. Field mapping
(camelCase ↔ snake_case, and `from`/`to` ↔ `from_user`/`to_user`) lives entirely
inside `SupabaseRepository`. See `docs/SPRINT-1B.md`.

Presence (`presenceService`) stays **in-memory** (it is the live routing source
of truth and must be synchronous). When Supabase is on, join/disconnect also
mirror `is_online`/`last_seen_at` onto the account row — but presence itself is
never the persistence backend.

### Object storage & token revocation (also pluggable)
- `services/storageService.js` — voicemail audio: Supabase Storage or local FS.
- `services/tokenStore.js` — logout revocation: Redis or in-memory.

All three (data, storage, tokens) follow the same credential-gated pattern.

---

## 5. Authentication design

Two token types, both signed JWT (`HS256`):

- **Access token** — short-lived (default 15m, `JWT_ACCESS_EXPIRES_IN`),
  `tokenUse:'access'`. Authorises REST (`authenticate`) and Socket.IO.
- **Refresh token** — long-lived (default 7d, `JWT_REFRESH_EXPIRES_IN`),
  `tokenUse:'refresh'`. Only valid at `POST /auth/refresh`, which mints a new
  access token. `tokenUse` is enforced, so a refresh token can't authenticate a
  request and an access token can't refresh.

- **Register/login** return `{ user, accessToken, refreshToken }` (+ a `token`
  alias = accessToken for legacy clients). Passwords hashed with **bcrypt**.
- **`GET /auth/me`** / **`POST /auth/logout`** require an access token. Logout
  revokes the access token (and a refresh token if supplied).
- **Revocation** is pluggable — in-memory `Set` by default, Redis when
  `REDIS_URL` is set (`services/tokenStore.js`, Sprint 1B) — so logout works
  across instances.
- **Per-user authorization** (`middleware/ownUser.js`): authenticated users may
  only read their **own** voicemails / call history (403 otherwise). Legacy
  unauthenticated requests pass through (`optionalAuth`) so nothing breaks.

### Socket authentication

`socketService` installs an `io.use` handshake middleware. A client may pass the
access token via `socket.handshake.auth.token` or `Authorization: Bearer`:

- valid  → `socket.user` attached (logged `authenticated=true`)
- invalid → logged as a warning, connection still allowed (unless
  `SOCKET_AUTH_REQUIRED=true`, Sprint 1B, which rejects it)
- absent → anonymous connection (legacy behaviour)

The SPA (Sprint 1C) always authenticates: it stores tokens in `localStorage`,
connects with `auth:{token}`, auto-refreshes on 401 and before expiry, resumes
the session on reload via `/auth/me`, and revokes on logout. Signalling event
names/payloads are unchanged, so voice calls are unaffected.

---

## 6. Configuration & secrets

All runtime knobs live in `config/index.js`, read from the environment via
**dotenv** (`.env` locally, platform env vars in production). See `.env.example`
for the full list. Production **fails fast** if `JWT_SECRET` is missing or still
the placeholder.

---

## 7. Error handling & logging

- `utils/asyncHandler` wraps async routes so rejections reach the central
  `middleware/errorHandler.js`, which returns consistent `{ error, code }` JSON
  (4xx messages are safe to expose; 5xx return a generic message and log the
  stack in development).
- Services throw `AppError` for expected failures (validation, auth, conflict)
  carrying a status code + machine `code`.
- `console.log` has been replaced by the structured logger (`utils/logger.js`):
  JSON lines in production, colourised in development, level-controlled via
  `LOG_LEVEL`. Request activity is logged at `debug`.

---

## 8. Deployment notes

- **server.js** listens only when run directly (`require.main === module`) and
  exports `app`/`server`/`io` for serverless + tests — preserved from v1.
- Vercel's read-only FS is respected (`/tmp` for uploads + data when
  `VERCEL=1`), but persistent WebSocket hosting (Render / Fly / Railway) is
  recommended for real calls (unchanged guidance from v1).
- Health check `/api/health` is unchanged for Render (`render.yaml`).

---

## 9. Roadmap

- ✅ **Sprint 1B** — Supabase persistence (factory + `SupabaseRepository`),
  object storage for voicemail audio (`storageService`), Redis token revocation
  (`tokenStore`), enforceable socket auth, presence mirroring. All optional.
- ✅ **Sprint 1C** — Authenticated SPA: register/login UI, JWT on the socket,
  refresh tokens (short access + long refresh), per-user voicemail/history
  authorization, persistent sessions, real logout.
- **Future** — TURN/STUN relay credentials; HttpOnly refresh-cookie hardening
  (and refresh-token rotation/reuse detection); SPA-driven Supabase queries with
  per-user RLS.
