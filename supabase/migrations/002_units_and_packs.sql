-- Adds liquids (ml) and pack sizes to foods. Safe to run more than once.
alter table public.foods add column if not exists unit text default 'g';
alter table public.foods add column if not exists pack_g numeric;
alter table public.foods add column if not exists pack_name text;
