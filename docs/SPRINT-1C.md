# Sprint 1C — SPA Authentication (Changelog & Verification)

**Goal:** Wire the frontend SPA to real authentication — register/login UI, JWT on
the socket, refresh tokens, and per-user voicemail/call-history authorization —
**without breaking the existing voice-calling flow.**

**Status:** ✅ Complete. The SPA now authenticates; voice calls are unchanged.

---

## 1. What changed

### Frontend (`public/index.html`) — the SPA is now authenticated
- **Login / Register UI** — a mode toggle replaces the username-only box; both
  username and password are required. Inline error messaging, validation.
- **Token storage** — access + refresh tokens (and the user object) are kept in
  `localStorage` (`callwave_access`, `callwave_refresh`, `callwave_user`).
- **Authenticated socket** — `io({ ..., auth: { token: <accessToken> } })`. The
  server handshake middleware (Sprint 1A/1B) validates it and attaches
  `socket.user`. Username comes from the auth response, not a free-text field.
- **`apiFetch()` wrapper** — attaches the access token to every REST call and
  **auto-refreshes once on 401** (single-flight) before retrying.
- **Proactive refresh** — `scheduleRefresh()` decodes the access token's `exp`
  and refreshes ~60s before it expires, so sessions stay alive seamlessly.
- **Persistent session** — on page load `resumeSession()` validates the stored
  token via `GET /auth/me`; if valid the app is entered directly (no re-login).
- **Real logout** — the ⎋ button calls `POST /auth/logout` (revoking both
  tokens), clears storage, disconnects the socket, and reloads to the login.
- All data calls (history, voicemails, upload, mark-listened) now go through the
  authenticated `apiFetch`/token path.

### Backend
- **Refresh tokens** (`services/authService.js`)
  - Split into `generateAccessToken` (default 15m, `tokenUse:'access'`) and
    `generateRefreshToken` (default 7d, `tokenUse:'refresh'`).
  - `verifyToken(token, expected)` enforces `tokenUse`: an access token can't
    refresh and a refresh token can't authenticate a request.
  - `POST /auth/refresh` exchanges a refresh token for a new access token;
    revoked tokens are rejected.
  - `/auth/register` & `/auth/login` now return `{ user, accessToken,
    refreshToken, token }` (`token` alias = accessToken, for old clients).
  - `/auth/logout` revokes both the access token and a refresh token (if given).
- **Per-user authorization** (`middleware/ownUser.js`)
  - `GET /api/voicemails/:username` and `GET /api/history/:username`: an
    authenticated user may **only read their own** data (403 otherwise).
    Unauthenticated (legacy) requests still pass through, so nothing breaks
    during the rollout and anonymous clients keep working.
- **Config** — `JWT_ACCESS_EXPIRES_IN` (15m) / `JWT_REFRESH_EXPIRES_IN` (7d).

### Config & docs
- `.env.example` documents the new JWT lifetimes.
- README + ARCHITECTURE updated (auth section, roadmap).

---

## 2. What did NOT change

- **WebRTC signalling event names/payloads** — voice calls are identical.
- **Presence flow** — `user:join` → `users:update` → contacts work as before.
- **The call/voicemail UX** — outgoing/incoming/accept/reject/voicemail recorder.
- **Server backward compatibility** — `SOCKET_AUTH_REQUIRED` stays `false` by
  default, so anonymous clients (e.g. the signalling test) still connect; the
  SPA simply opts into auth.

---

## 3. How to verify

```bash
npm install
npm start                       # http://localhost:3000

node test/auth.test.js          # 18/18  refresh + per-user authz + revocation
node test/spaFlow.test.js       #  9/9   full authenticated SPA flow
node test/signaling.test.js     # 11/11  voice signalling (unchanged)
node test/dataLayer.test.js     # 16/16  data layer (unchanged)
```

Manual: open the app in two browsers → **Register** `alice` and `bob` → both
appear in Contacts → call each other → leave a voicemail → each sees only their
own voicemails/history. Reload the page → you stay logged in (session resumed).

---

## 4. Acceptance criteria — results

| # | Criterion (Sprint 1C)                       | Result |
|---|---------------------------------------------|--------|
| 1 | SPA register/login UI                       | ✅ Mode toggle + username/password + validation + errors |
| 2 | Token sent on the socket                    | ✅ `auth:{token}` validated server-side; `socket.user` attached |
| 3 | Refresh tokens (rotate access before expiry)| ✅ `/auth/refresh`, proactive refresh + 401 auto-refresh; tokenUse enforced |
| 4 | Per-user voicemail/history authorization    | ✅ authenticated users restricted to own data (403); legacy still open |
| 5 | Session persists across reload              | ✅ `resumeSession` validates via `/auth/me` and re-enters |
| 6 | Voice calls still work                      | ✅ 11/11 signalling; full call flow verified through authenticated sockets |
| 7 | App starts without errors                   | ✅ Boots clean |

---

## 5. Security notes

- Access tokens are short-lived (15m); refresh tokens long-lived (7d) and
  revocable on logout (memory or Redis via the Sprint 1B `tokenStore`).
- `tokenUse` claims prevent refresh↔access misuse even if a token leaks.
- Tokens live in `localStorage` (SPA standard). For hardening, a future sprint
  could move refresh tokens to an HttpOnly cookie (would require CORS
  `credentials` changes) — documented as a known trade-off.
- Per-user authorization is enforced when authenticated; set
  `SOCKET_AUTH_REQUIRED=true` to also require a token to *connect*.

---

## 6. Remaining (future)

- TURN/STUN relay credentials (infra — set `TURN_*` env once a relay exists).
- HttpOnly refresh-cookie hardening + refresh-token rotation/reuse detection.
- SPA-driven direct Supabase queries with per-user RLS (currently all access
  flows through the API, which is the security boundary).
