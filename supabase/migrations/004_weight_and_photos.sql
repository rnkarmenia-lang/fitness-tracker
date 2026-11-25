-- Phase 5: weight the goals use, and private progress photos. Safe to run more than once.

-- Each Profile save records the weight the calorie goals start from.
alter table public.goal_history add column if not exists kg numeric;

-- Private bucket for progress photos. Files live under <your user id>/...
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos own folder" on storage.objects;
create policy "photos own folder" on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
