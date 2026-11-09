const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'data/neighborhood-search.js'),'utf8'),ctx);
const zips=ctx.window.NYC_SEARCH_DATA.zips.map(z=>z.zip);
if(!zips.every(z=>/^\d{5}$/.test(z)))throw Error('Invalid ZIP data');
const seed=zips.map(z=>`('${z}')`).join(',');
const sql=`-- RAT & CITY: run once in a new/dedicated Supabase project's SQL Editor.
-- Stores only ZIP-level public feedback; no clicked coordinates or addresses.
begin;
create schema if not exists rat_city_private;
revoke all on schema rat_city_private from public, anon, authenticated;

create table if not exists rat_city_private.allowed_zips (zip text primary key);
insert into rat_city_private.allowed_zips(zip) values ${seed} on conflict do nothing;
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
`;
fs.mkdirSync(path.join(root,'supabase'),{recursive:true});
fs.writeFileSync(path.join(root,'supabase/setup.sql'),sql);
console.log('Generated setup.sql with '+zips.length+' allowed ZIPs');
