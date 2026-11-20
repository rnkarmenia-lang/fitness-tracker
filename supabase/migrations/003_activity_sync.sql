-- Apple Watch sync: the iPhone Shortcut calls this with your private sync token.
-- POST {supabaseUrl}/rest/v1/rpc/sync_activity  header apikey: <publishable key>
-- body: {"p_token": "...", "p_steps": 8123, "p_km": 6.2}   (optional "p_date": "2026-11-20", "p_tz": "Asia/Nicosia")
-- Safe to run more than once.
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
