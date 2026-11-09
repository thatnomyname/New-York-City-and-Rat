-- RAT & CITY: run once in a new/dedicated Supabase project's SQL Editor.
-- Stores only ZIP-level public feedback; no clicked coordinates or addresses.
begin;
create schema if not exists rat_city_private;
revoke all on schema rat_city_private from public, anon, authenticated;

create table if not exists rat_city_private.allowed_zips (zip text primary key);
insert into rat_city_private.allowed_zips(zip) values ('10001'),('10002'),('10003'),('10004'),('10005'),('10006'),('10007'),('10009'),('10010'),('10011'),('10012'),('10013'),('10014'),('10016'),('10017'),('10018'),('10019'),('10020'),('10021'),('10022'),('10023'),('10024'),('10025'),('10026'),('10027'),('10028'),('10029'),('10030'),('10031'),('10032'),('10033'),('10034'),('10035'),('10036'),('10037'),('10038'),('10039'),('10040'),('10044'),('10065'),('10069'),('10075'),('10119'),('10128'),('10162'),('10199'),('10278'),('10280'),('10282'),('10301'),('10302'),('10303'),('10304'),('10305'),('10306'),('10307'),('10308'),('10309'),('10310'),('10311'),('10312'),('10314'),('10451'),('10452'),('10453'),('10454'),('10455'),('10456'),('10457'),('10458'),('10459'),('10460'),('10461'),('10462'),('10463'),('10464'),('10465'),('10466'),('10467'),('10468'),('10469'),('10470'),('10471'),('10472'),('10473'),('10474'),('10475'),('11004'),('11005'),('11101'),('11102'),('11103'),('11104'),('11105'),('11106'),('11109'),('11201'),('11203'),('11204'),('11205'),('11206'),('11207'),('11208'),('11209'),('11210'),('11211'),('11212'),('11213'),('11214'),('11215'),('11216'),('11217'),('11218'),('11219'),('11220'),('11221'),('11222'),('11223'),('11224'),('11225'),('11226'),('11228'),('11229'),('11230'),('11231'),('11232'),('11233'),('11234'),('11235'),('11236'),('11237'),('11238'),('11239'),('11249'),('11354'),('11355'),('11356'),('11357'),('11358'),('11359'),('11360'),('11361'),('11362'),('11363'),('11364'),('11365'),('11366'),('11367'),('11368'),('11369'),('11370'),('11371'),('11372'),('11373'),('11374'),('11375'),('11377'),('11378'),('11379'),('11385'),('11411'),('11412'),('11413'),('11414'),('11415'),('11416'),('11417'),('11418'),('11419'),('11420'),('11421'),('11422'),('11423'),('11424'),('11426'),('11427'),('11428'),('11429'),('11430'),('11432'),('11433'),('11434'),('11435'),('11436'),('11439'),('11451'),('11691'),('11692'),('11693'),('11694'),('11697') on conflict do nothing;
create table if not exists rat_city_private.submission_limits (
  client_id uuid primary key,
  last_submitted_at timestamptz not null
);
alter table rat_city_private.allowed_zips enable row level security;
alter table rat_city_private.submission_limits enable row level security;
revoke all on all tables in schema rat_city_private from public, anon, authenticated;
drop policy if exists rat_city_no_browser_access on rat_city_private.allowed_zips;
create policy rat_city_no_browser_access on rat_city_private.allowed_zips for all to anon, authenticated using (false) with check (false);
drop policy if exists rat_city_no_browser_access on rat_city_private.submission_limits;
create policy rat_city_no_browser_access on rat_city_private.submission_limits for all to anon, authenticated using (false) with check (false);

create table if not exists public.rat_feedback (
  id uuid primary key,
  zip text not null references rat_city_private.allowed_zips(zip),
  rating text not null check (rating in ('low','moderate','high')),
  comment text not null default '' check (char_length(comment)<=500),
  created_at timestamptz not null default now()
);
create index if not exists rat_feedback_zip_created_idx on public.rat_feedback(zip,created_at desc);
create index if not exists rat_feedback_created_id_idx on public.rat_feedback(created_at,id);
alter table public.rat_feedback enable row level security;
revoke all on public.rat_feedback from public, anon, authenticated;
grant select on public.rat_feedback to anon, authenticated;
drop policy if exists rat_feedback_public_read on public.rat_feedback;
create policy rat_feedback_public_read on public.rat_feedback for select to anon, authenticated using (true);

-- Browser roles cannot directly insert, update, delete, or set timestamps.
-- The RPC validates input, enforces idempotency and limits accidental repeats.
create or replace function public.rat_city_submit(
  p_request_id uuid, p_client_id uuid, p_zip text, p_rating text, p_comment text default ''
) returns public.rat_feedback
language plpgsql security invoker set search_path = '' as $$
declare
  prior public.rat_feedback;
  saved public.rat_feedback;
  last_time timestamptz;
  cleaned text := pg_catalog.btrim(coalesce(p_comment,''));
begin
  if p_request_id is null or p_client_id is null then raise exception 'Missing submission ID'; end if;
  if p_rating is null or p_rating not in ('low','moderate','high') then raise exception 'Invalid rating'; end if;
  if p_zip is null or not exists(select 1 from rat_city_private.allowed_zips where zip=p_zip) then raise exception 'ZIP is outside map coverage'; end if;
  if pg_catalog.char_length(cleaned)>500 then raise exception 'Comment is too long'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_id::text,0));
  select * into prior from public.rat_feedback where id=p_request_id;
  if found then
    if prior.zip<>p_zip or prior.rating<>p_rating or prior.comment<>cleaned then raise exception 'Submission ID already used'; end if;
    return prior;
  end if;
  select last_submitted_at into last_time from rat_city_private.submission_limits where client_id=p_client_id;
  if last_time is not null and last_time>pg_catalog.clock_timestamp()-interval '30 seconds' then raise exception 'Please wait 30 seconds before another submission'; end if;
  insert into public.rat_feedback(id,zip,rating,comment) values(p_request_id,p_zip,p_rating,cleaned) returning * into saved;
  insert into rat_city_private.submission_limits(client_id,last_submitted_at) values(p_client_id,pg_catalog.clock_timestamp())
    on conflict(client_id) do update set last_submitted_at=excluded.last_submitted_at;
  return saved;
end;
$$;
revoke all on function public.rat_city_submit(uuid,uuid,text,text,text) from public, anon, authenticated;
grant usage on schema rat_city_private to service_role;
grant select on rat_city_private.allowed_zips to service_role;
grant select, insert, update on rat_city_private.submission_limits to service_role;
grant select, insert on public.rat_feedback to service_role;
grant execute on function public.rat_city_submit(uuid,uuid,text,text,text) to service_role;

-- Do not duplicate the Realtime publication entry when rerunning this script.
do $$ begin
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rat_feedback') then
    alter publication supabase_realtime add table public.rat_feedback;
  end if;
end $$;
commit;
