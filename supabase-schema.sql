-- =====================================================================
-- heydate — Supabase backend schema
-- Run this once in Supabase Studio → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles — one row per account, owned by the user
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  phone          text,
  notify_channel text not null default 'text'
                 check (notify_channel in ('text', 'email', 'both')),
  timezone       text default 'America/New_York',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is 'Account profile for each heydate user.';

-- ---------------------------------------------------------------------
-- 2. user_state — the app data that used to live in localStorage
--    Kept as JSONB so the existing front-end data shapes work unchanged.
-- ---------------------------------------------------------------------
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  people     jsonb not null default '[]'::jsonb,
  dismissed  jsonb not null default '{}'::jsonb,
  purchases  jsonb not null default '{}'::jsonb,
  deals_seen jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_state is 'Per-user heydate app state (people, reminders sent, gifts bought).';

-- ---------------------------------------------------------------------
-- 3. Row Level Security — a user can only ever touch their own rows
-- ---------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.user_state enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

drop policy if exists "user_state_select_own" on public.user_state;
create policy "user_state_select_own" on public.user_state
  for select using (auth.uid() = user_id);

drop policy if exists "user_state_insert_own" on public.user_state;
create policy "user_state_insert_own" on public.user_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_state_update_own" on public.user_state;
create policy "user_state_update_own" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_state_delete_own" on public.user_state;
create policy "user_state_delete_own" on public.user_state
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. Auto-create profile + empty state whenever someone signs up
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, notify_channel)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'notify_channel', 'text')
  )
  on conflict (id) do nothing;

  insert into public.user_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. Keep updated_at honest
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before update on public.user_state
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. Backfill for any users that existed before this script ran
-- ---------------------------------------------------------------------
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

insert into public.user_state (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;
