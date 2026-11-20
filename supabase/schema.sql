-- Fitness Tracker database schema.
-- Run once in Supabase: SQL Editor -> New query -> paste all -> Run.
-- Safe to run again: everything uses "if not exists" / "or replace".

create extension if not exists pgcrypto;

-- ---------- Profile (one row per user) ----------
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  username           text not null,
  email              text,
  sex                text check (sex in ('male','female')),
  birth_date         date,
  height_cm          numeric,
  start_weight_kg    numeric,
  activity_factor    numeric default 1.3,
  target_weight_kg   numeric,
  target_date        date,
  -- Manual overrides; null means "use the suggested value"
  deficit_override   integer,
  kcal_override      integer,
  protein_override   integer,
  fat_override       integer,
  carbs_override     integer,
  fibre_g            integer default 30,
  step_goal          integer default 10000,
  sync_token         text,
  completed          boolean default false,
  updated_at         timestamptz default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ---------- Foods (your cache of database foods + your own foods), values per 100 g ----------
create table if not exists public.foods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source        text not null check (source in ('off','usda','mfp','mine')),
  source_id     text not null,
  barcode       text,
  name          text not null,
  brand         text,
  serving_name  text,
  serving_g     numeric,
  kcal          numeric,
  protein       numeric,
  carbs         numeric,
  fat           numeric,
  fibre         numeric,
  sugar         numeric,
  sat_fat       numeric,
  sodium_mg     numeric,
  last_used     timestamptz,
  created_at    timestamptz default now(),
  unique (user_id, source, source_id)
);
create index if not exists foods_user_barcode on public.foods (user_id, barcode);
create index if not exists foods_user_last_used on public.foods (user_id, last_used desc);

-- ---------- My meals (recipes) ----------
create table if not exists public.meals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null,
  total_g        numeric,
  portions       numeric default 1,
  created_at     timestamptz default now()
);
create table if not exists public.meal_ingredients (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id   uuid not null references public.meals(id) on delete cascade,
  food_id   uuid not null references public.foods(id) on delete restrict,
  grams     numeric not null
);

-- ---------- Diary (nutrients copied at the time of logging) ----------
create table if not exists public.diary_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null,
  meal          text not null check (meal in ('breakfast','lunch','snacks','dinner')),
  food_id       uuid references public.foods(id) on delete set null,
  meal_id       uuid references public.meals(id) on delete set null,
  name          text not null,
  amount_label  text,
  grams         numeric,
  kcal          numeric default 0,
  protein       numeric default 0,
  carbs         numeric default 0,
  fat           numeric default 0,
  fibre         numeric,
  sugar         numeric,
  sat_fat       numeric,
  sodium_mg     numeric,
  source        text,
  created_at    timestamptz default now()
);
create index if not exists diary_user_date on public.diary_entries (user_id, date);

-- ---------- Activity ----------
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  type        text not null,
  minutes     integer not null,
  kcal        integer,
  notes       text,
  created_at  timestamptz default now()
);
create index if not exists workouts_user_date on public.workouts (user_id, date);

create table if not exists public.daily_activity (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  steps      integer,
  km         numeric,
  synced_at  timestamptz default now(),
  primary key (user_id, date)
);

-- ---------- Weight ----------
create table if not exists public.weights (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date     date not null,
  kg       numeric not null,
  note     text,
  primary key (user_id, date)
);

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  path        text not null,
  created_at  timestamptz default now()
);

create table if not exists public.goal_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  kcal        integer,
  protein     integer,
  fat         integer,
  carbs       integer,
  fibre       integer,
  reason      text,
  created_at  timestamptz default now()
);

-- ---------- Row-level security: every table is yours only ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','foods','meals','meal_ingredients','diary_entries','workouts','daily_activity','weights','photos','goal_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- New sign-ups get a profile row automatically ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, username, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)), new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile rows for accounts that existed before this script
insert into public.profiles (user_id, username, email)
select id, coalesce(nullif(raw_user_meta_data->>'username',''), split_part(email,'@',1)), email
from auth.users
on conflict (user_id) do nothing;

-- ---------- Added after phase 2: liquids (ml) and pack sizes ----------
alter table public.foods add column if not exists unit text default 'g';
alter table public.foods add column if not exists pack_g numeric;
alter table public.foods add column if not exists pack_name text;

-- ---------- Sign in with username: returns the email for a username ----------
create or replace function public.email_for_username(p_username text) returns text
language sql security definer set search_path = public stable as $$
  select email from public.profiles where lower(username) = lower(p_username) limit 1;
$$;
revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------- Added in phase 4: Apple Watch sync (see migrations/003_activity_sync.sql) ----------
create unique index if not exists profiles_sync_token on public.profiles (sync_token) where sync_token is not null;

create or replace function public.sync_activity(p_token text, p_steps numeric, p_km numeric default null,
                                                p_date date default null, p_tz text default 'Asia/Nicosia')
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; d date;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'Missing or invalid token'; end if;
  select user_id into uid from public.profiles where sync_token = p_token;
  if uid is null then raise exception 'Unknown token. Make a new one in the app and paste it into the Shortcut.'; end if;
  if p_steps is null or p_steps < 0 or p_steps > 200000 then raise exception 'Steps look wrong: %', p_steps; end if;
  d := coalesce(p_date, (now() at time zone coalesce(nullif(p_tz, ''), 'Asia/Nicosia'))::date);
  insert into public.daily_activity (user_id, date, steps, km, synced_at)
  values (uid, d, round(p_steps)::int, round(p_km, 2), now())
  on conflict (user_id, date) do update
    set steps = excluded.steps, km = coalesce(excluded.km, public.daily_activity.km), synced_at = now();
  return 'Saved ' || round(p_steps)::int || ' steps for ' || d;
end $$;
revoke all on function public.sync_activity(text, numeric, numeric, date, text) from public;
grant execute on function public.sync_activity(text, numeric, numeric, date, text) to anon, authenticated;
