# Sprint 1B — Supabase Integration (Changelog & Verification)

**Goal:** Replace the JSON/file persistence with Supabase, add cloud object
storage for voicemail audio, make socket authentication enforceable, and back
token revocation with Redis — **without breaking anything that worked in 1A.**

**Status:** ✅ Complete. Every feature is **optional and credential-gated**: with
no Supabase/Redis config the app runs exactly as in Sprint 1A (all 1A tests
still pass); set the env vars and the production backends take over.

---

## 1. Design principle: credential-gated backends

A single factory per concern inspects `config` at startup and selects the
backend. **No credentials → local fallback; credentials present → cloud
backend.** Same interfaces either way, so calling code never branches.

| Concern             | Default (no creds)         | Production (creds set)         | Env trigger                       |
|---------------------|----------------------------|--------------------------------|-----------------------------------|
| Data (accounts/calls/vm) | JSON files (`data/*.json`) | Supabase Postgres           | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| Voicemail audio     | Local FS (`/uploads`)      | Supabase Storage bucket        | `SUPABASE_STORAGE_BUCKET` (+ Supabase on) |
| Token revocation    | In-memory `Set`            | Redis (shared across instances)| `REDIS_URL`                       |
| Socket auth         | Permissive (anonymous ok)  | Required (reject no-token)     | `SOCKET_AUTH_REQUIRED=true`       |
| Presence mirror     | In-memory only             | Mirrored to `accounts` rows    | Supabase enabled                  |

This means **Sprint 1A behaviour is preserved byte-for-byte** until you opt in.

---

## 2. What changed

### Data layer — Supabase repository + factory (`services/`)
- New `services/repositories/`:
  - `jsonRepository.js` — moved out of `dataService` (unchanged behaviour).
  - `supabaseClient.js` — lazy singleton using the **service-role key**.
  - `supabaseRepository.js` — same async interface as `JsonRepository`.
- `services/dataService.js` is now a **factory** that instantiates `SupabaseRepository`
  when Supabase is configured, else `JsonRepository`. Consumers are unchanged —
  they still call `db.<collection>.<method>()`.

**Field mapping.** JS camelCase ↔ SQL snake_case is automatic
(`passwordHash`→`password_hash`, `createdAt`→`created_at`, …). The SQL
reserved words `from`/`to` map explicitly to `from_user`/`to_user` columns.
Timestamps are stored as epoch-ms `bigint` so the JS layer always sees numbers
(no ISO/string surprises for the client).

### Object storage (`services/storageService.js`)
- `save / remove / urlFor` with a `local` and a `supabase` provider.
- `routes/voicemail.js` now uses `multer.memoryStorage()` + `storageService`,
  so the upload route is provider-agnostic. Local provider returns the same
  `/uploads/<file>` URL as before (backward compatible); Supabase returns a
  public Storage URL.

### Token revocation (`services/tokenStore.js`)
- `add / has` interface with `MemoryTokenStore` (default, auto-pruned) and
  `RedisTokenStore` (TTL per token, shared). `authService` + the auth middleware
  were made `async` to await this. Redis keys are keyed on the JWT signature.

### Socket auth enforcement (`services/socketService.js`)
- The handshake middleware now rejects unauthenticated connections when
  `SOCKET_AUTH_REQUIRED=true`. Default remains permissive (legacy client works).

### Presence persistence
- `userService.updateStatus()` mirrors `is_online`/`last_seen_at` to the account
  row on join/disconnect — but **only when Supabase is on**, so the JSON path
  doesn't churn `accounts.json` on every connect.

### Schema & config
- `db/schema.sql` — `accounts`, `calls`, `voicemails` tables + indexes, RLS
  (default-deny; service role bypasses), and a public `voicemails` storage bucket.
- `config/index.js` + `.env.example` — all new vars documented; production
  still fails fast on a missing `JWT_SECRET`.

---

## 3. What did NOT change

- **All WebRTC signalling event names/payloads** — voice calls are untouched.
- **All existing REST paths and response shapes** — voicemail upload still
  returns `{ success, voicemail }` with `voicemail.file` usable by `<audio>`.
- **The auth API** (`/auth/register|login|me|logout`) — same request/response.
- **The SPA** (`public/index.html`) — still works without a token.
- **Vercel handling** (`require.main` guard, `/tmp`) and the `/api/health` probe.

---

## 4. How to verify

```bash
npm install
cp .env.example .env            # set JWT_SECRET; leave Supabase/Redis blank
npm start

# data-layer + field-mapping tests (no server / no DB needed):
node test/dataLayer.test.js     # → 16/16

# full signalling + socket regression (server running):
node test/signaling.test.js     # → 11/11
```

### Going live with Supabase
1. Create a Supabase project; run `db/schema.sql` in the SQL editor.
2. In `.env`, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_STORAGE_BUCKET=voicemails`.
3. (Optional) `REDIS_URL=...` and `SOCKET_AUTH_REQUIRED=true`.
4. Restart — the boot log will print `backend="supabase"` and `provider="supabase"`.

---

## 5. Acceptance criteria — results

| # | Criterion (Sprint 1B)            | Result |
|---|----------------------------------|--------|
| 1 | Supabase persistence via swap point | ✅ Factory + `SupabaseRepository` (same interface); JSON fallback verified |
| 2 | Cloud object storage for voicemail | ✅ `storageService` (Supabase Storage + local); field mapping unit-tested; upload route provider-agnostic |
| 3 | Enforce socket auth              | ✅ `SOCKET_AUTH_REQUIRED` gate in handshake middleware (off by default) |
| 4 | Redis token revocation           | ✅ `tokenStore` (memory default + Redis); auth flow async-verified incl. revocation → 401 |
| 5 | Nothing from 1A breaks           | ✅ 11/11 signalling, 16/16 data-layer, auth + voicemail regression all pass with no creds |

---

## 6. Notes & trade-offs

- **`find`/`findOne`** accept an opaque JS predicate, so the Supabase impl
  fetches all rows then filters in memory (correct, uniform interface). Hot
  primary-key paths (`findById`/`updateById`/`removeById`) use indexed queries.
  A query-builder optimisation is a later, internal change — no caller impact.
- **Supabase Storage vs S3/R2:** Storage was chosen for cohesion (one cloud
  account, public URLs out of the box). The `storageService` abstraction means
  an S3/R2 provider can be added with one more object implementing the same
  3-method interface.
- **RLS default-deny:** the server uses the service role key, so RLS doesn't
  affect it. Direct browser/anon access is denied until you add per-user
  policies (intentional — clients go through the API).

---

## 7. Deferred to Sprint 1C

- Wire the SPA to auth (register/login UI, send token on the socket,
  per-user voicemail authorization, refresh tokens).
- SPA-driven Supabase queries + per-user RLS policies if direct client access
  is desired.
- TURN/STUN relay credentials.
