-- =============================================================================
-- CallWave Pro — Supabase schema (Sprint 1B)
-- =============================================================================
-- Run this in the Supabase dashboard SQL editor (or `supabase db push`).
-- Safe to re-run (idempotent-ish: uses IF NOT EXISTS / OR REPLACE).
--
-- The Node server talks to Supabase with the SERVICE ROLE key, which bypasses
-- Row Level Security. RLS is therefore enabled with a default-deny policy so
-- that direct client/anon-key access is blocked — all data access flows
-- through the CallWave API, which is the intended security boundary.
-- =============================================================================

-- Required by Supabase for uuid generation if not already present.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    bigint not null,           -- epoch ms (matches the JS layer)
  updated_at    bigint not null,           -- epoch ms
  last_seen_at  bigint,                    -- epoch ms; mirrored from presence
  is_online     boolean not null default false
);

create index if not exists accounts_username_idx on public.accounts (lower(username));

-- ---------------------------------------------------------------------------
-- calls
--   NOTE: JS fields `from`/`to` are SQL reserved words, so they map to
--   from_user / to_user (see services/repositories/supabaseRepository.js).
-- ---------------------------------------------------------------------------
create table if not exists public.calls (
  id          uuid primary key default gen_random_uuid(),
  from_user   text,
  to_user     text,
  status      text,
  timestamp   bigint,                      -- epoch ms
  duration    integer not null default 0,
  ended_at    bigint                       -- epoch ms
);

create index if not exists calls_from_user_idx on public.calls (from_user);
create index if not exists calls_to_user_idx   on public.calls (to_user);

-- ---------------------------------------------------------------------------
-- voicemails
-- ---------------------------------------------------------------------------
create table if not exists public.voicemails (
  id             uuid primary key default gen_random_uuid(),
  from_user      text,
  to_user        text,
  file           text,                     -- '/uploads/...' (local) or Supabase URL
  filename       text,                     -- storage key
  timestamp      bigint,                   -- epoch ms
  duration       integer not null default 0,
  listened       boolean not null default false,
  transcription  text
);

create index if not exists voicemails_to_user_idx on public.voicemails (to_user);

-- ---------------------------------------------------------------------------
-- Row Level Security (default deny for direct client access)
-- ---------------------------------------------------------------------------
alter table public.accounts   enable row level security;
alter table public.calls      enable row level security;
alter table public.voicemails enable row level security;

-- No policies are granted to anon/authenticated roles on purpose: the server
-- uses the service role key (which bypasses RLS), and browser clients must go
-- through the CallWave REST API. Add per-user policies here later if you start
-- querying Supabase directly from the client.

-- ---------------------------------------------------------------------------
-- Object storage bucket for voicemail audio
-- ---------------------------------------------------------------------------
-- Create a PUBLIC bucket named "voicemails" so uploaded audio is playable via
-- its public URL in the browser <audio> element.
insert into storage.buckets (id, name, public)
values ('voicemails', 'voicemails', true)
on conflict (id) do nothing;

-- Allow anyone to read (public bucket) and the service role to write.
-- (The service role bypasses these anyway; this covers anon reads.)
-- Drop & recreate to stay idempotent.
drop policy if exists "voicemails public read" on storage.objects;
create policy "voicemails public read"
  on storage.objects for select
  using (bucket_id = 'voicemails');
