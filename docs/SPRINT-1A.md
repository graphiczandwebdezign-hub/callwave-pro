# Sprint 1A — Changelog & Verification

**Goal:** Refactor CallWave Pro from a prototype into a production-ready,
modular architecture **without breaking existing voice-calling functionality.**

**Status:** ✅ Complete. All acceptance criteria verified (see §4).

---

## 1. What changed

### Refactor — monolith → modular layers
The previous single `server.js` (332 lines of mixed concerns) is now a thin
composition root. Logic was extracted into focused modules:

| Concern            | Before                          | After                                   |
|--------------------|---------------------------------|-----------------------------------------|
| App wiring         | inline in server.js             | `server.js` (thin) + `routes/` + `middleware/` |
| Config / secrets   | scattered `process.env.*`       | `config/index.js` (dotenv, single source) |
| Persistence        | inline `store.json` read/write  | `services/dataService.js` (repositories)|
| Online users       | module-level `users` maps       | `services/presenceService.js`           |
| Call history       | inline `callHistory` array      | `services/callService.js`               |
| Voicemail          | inline `voicemails` array       | `services/voicemailService.js`          |
| Signalling         | inline `io.on('connection')`    | `services/socketService.js`             |
| Logging            | `console.log` everywhere        | `utils/logger.js` (structured)          |
| Errors             | ad-hoc try/catch                | `utils/AppError` + `middleware/errorHandler.js` |

New folders: `/config`, `/middleware`, `/services`, `/routes`, `/utils`.

### Data layer (modular, ready for Supabase)
- `JsonRepository` implements a clean async interface (`all/find/findOne/
  findById/insert/updateById/removeById`) for three collections:
  `accounts`, `calls`, `voicemails`.
- Persistence moved from one `store.json` to one file per collection.
- **Sprint 1B only needs to re-implement this interface against Supabase** — no
  caller changes required.

### Environment configuration (dotenv)
- `.env.example` documents every variable (CORS, JWT, bcrypt, logging,
  Sprint-1B placeholders).
- `.env` is gitignored; a local one is generated for development.
- Production **fails fast** on a missing/placeholder `JWT_SECRET`.

### Authentication (new)
| Endpoint              | Auth   | Purpose                          |
|-----------------------|--------|----------------------------------|
| `POST /auth/register` | —      | Create account → `{ user, token }` |
| `POST /auth/login`    | —      | Verify creds → `{ user, token }`   |
| `GET  /auth/me`       | Bearer | Return current user              |
| `POST /auth/logout`   | Bearer | Revoke current token             |

- JWT (HS256) + bcrypt password hashing.
- `middleware/auth.js` provides `authenticate` (hard) and `optionalAuth`
  (permissive, applied to legacy APIs so nothing breaks).
- Logout uses an in-memory revocation set, auto-pruned on token expiry.

### Socket.IO — authenticated connections prepared
- `io.use` handshake middleware reads a JWT from `auth.token` or
  `Authorization: Bearer`. Valid → `socket.user` attached; invalid/absent →
  anonymous connection still allowed (permissive).
- **All signalling event names and payloads are byte-for-byte identical to v1**
  (`user:join`, `call:incoming`, `webrtc:offer/answer/ice-candidate`,
  `call:go-voicemail`, `voicemail:new`, `users:update`, …) → existing calls work.
- Hardening to *require* auth is a documented one-line change for later.

### Logging & error handling
- Structured logger: JSON in production, colourised in development, controlled
  by `LOG_LEVEL`. `console.log` removed from the server code.
- Central `errorHandler` returns uniform `{ error, code }` JSON; 5xx details are
  hidden from clients but logged in dev. Multer/size errors map to `413`.

### Documentation
- `docs/ARCHITECTURE.md` — layered design, dependency rules, data-layer swap
  point, auth model, roadmap.
- `README.md` — updated structure, run/test instructions, env setup.
- This file.

---

## 2. What did NOT change (compatibility guarantees)

- **Voice calls work exactly as before.** WebRTC media stays P2P; the server
  only relays signalling. Event names/payloads are unchanged.
- **Every existing REST path is identical** (incl. the quirk that the list
  endpoint is plural `/api/voicemails/:username` while the action endpoint is
  singular `/api/voicemail/:id/listened`).
- **The SPA (`public/index.html`) is untouched** — it still joins with a
  username and works without a token. (Wiring it to register/login is Sprint 1C.)
- **Vercel path handling** (`/tmp` under `VERCEL=1`) and the
  `require.main === module` listen guard are preserved.
- **Dependencies unchanged** except three additions: `dotenv`, `jsonwebtoken`,
  `bcryptjs` (+ `socket.io-client` dev-only, for the test).

---

## 3. How to verify

```bash
npm install
cp .env.example .env          # then set JWT_SECRET
npm start                     # http://localhost:3000

# automated signalling + socket-auth E2E test (server must be running):
node test/signaling.test.js
```

Manual quick-check of the auth API:

```bash
curl -X POST localhost:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret123"}'
curl localhost:3000/auth/me -H 'Authorization: Bearer <TOKEN>'
```

---

## 4. Acceptance criteria — results

| # | Criterion                              | Result |
|---|----------------------------------------|--------|
| 1 | Existing voice calls still work        | ✅ 11/11 signalling E2E checks pass (join, initiate, incoming/outgoing, accept, offer/answer/ICE relay, end, disconnect cleanup) |
| 2 | Application starts without errors      | ✅ Boots clean; 0 runtime errors |
| 3 | Authentication endpoints exist         | ✅ register/login/me/logout all return correct codes (incl. 401 bad creds, 409 dup, 400 validation, revocation) |
| 4 | Clean modular architecture             | ✅ /config /middleware /services /routes /utils; inward-pointing dependencies |
| 5 | Ready for Supabase integration (1B)    | ✅ Repository interface is the documented swap point; all persistence async |

---

## 5. Deferred to later sprints (intentional)

- **Sprint 1B:** Supabase repositories; S3/R2 voicemail audio; persist
  presence; enforce socket auth; Redis-backed token revocation.
- **Sprint 1C:** Wire the SPA to the auth endpoints (register/login UI, send
  token on socket, per-user voicemail authorization, refresh tokens).
