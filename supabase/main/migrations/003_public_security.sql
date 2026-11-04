-- PUP Unisan public submissions, moderation, bans and consent.
-- Apply after the site's base schema and RLS migrations.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.visitor_abuse (
  visitor_id uuid primary key,
  ip_hash text,
  offense_count integer not null default 0 check (offense_count >= 0),
  serious_offense_count integer not null default 0 check (serious_offense_count >= 0),
  previous_ban_restriction boolean not null default false,
  last_offense_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_bans (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  ip_hash text,
  reason text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id),
  created_by text not null default 'system' check (created_by in ('system','admin')),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);
create index if not exists visitor_bans_active_idx on public.visitor_bans(visitor_id, expires_at) where lifted_at is null;

create table if not exists public.public_comments (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  display_name text not null check (length(display_name) between 1 and 80),
  body text not null check (length(body) between 3 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  held_for_review boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  moderation_note text
);
create index if not exists public_comments_queue_idx on public.public_comments(status, created_at desc);

create table if not exists public.security_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  visitor_id uuid,
  subject_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  ip_hash text,
  event_type text not null check (event_type in ('captcha_failed','rate_limited','blocked_ban','comment_submitted','ban_issued')),
  created_at timestamptz not null default now()
);
create index if not exists security_events_visitor_time_idx on public.security_events(visitor_id, created_at desc);

create table if not exists public.cookie_consents (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  essential boolean not null default true check (essential),
  analytics boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(visitor_id)
);

alter table public.visitor_abuse enable row level security;
alter table public.visitor_bans enable row level security;
alter table public.public_comments enable row level security;
alter table public.security_audit_logs enable row level security;
alter table public.security_events enable row level security;
alter table public.cookie_consents enable row level security;

-- Public visitors only see approved comments. All writes are through the verified
-- Netlify function using a server-only service role key.
drop policy if exists "approved comments are public" on public.public_comments;
create policy "approved comments are public" on public.public_comments for select to anon, authenticated using (status = 'approved');
-- Existing authenticated admin helpers are defined in the base RLS migration.
drop policy if exists "admins manage comments" on public.public_comments;
create policy "admins manage comments" on public.public_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Abuse signals, bans, audit records and consent rows are server-only.
revoke all on public.visitor_abuse, public.visitor_bans, public.security_audit_logs, public.security_events, public.cookie_consents from anon, authenticated;
revoke insert, update, delete on public.public_comments from anon, authenticated;
grant select on public.public_comments to anon, authenticated;
grant all on public.public_comments to authenticated;

-- Privileged submission transaction. Only the server-side function with service role may call it.
create or replace function public.submit_public_comment(p_visitor_id uuid, p_ip_hash text, p_display_name text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  abuse public.visitor_abuse;
  result_id uuid;
  held boolean := false;
  recent_count integer;
  ip_recent_count integer;
  repeat_limit_count integer;
  previous_bans integer;
  ban_days integer;
  active_ban boolean;
begin
  if length(trim(p_display_name)) not between 1 and 80 or length(trim(p_body)) not between 3 and 1500 then
    raise exception 'Invalid comment';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id::text, 0));
  select * into abuse from public.visitor_abuse where visitor_id=p_visitor_id for update;
  select exists(select 1 from public.visitor_bans b where b.visitor_id=p_visitor_id and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())) into active_ban;
  if active_ban then
    insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'blocked_ban');
    return jsonb_build_object('accepted',false,'reason','banned');
  end if;
  select count(*) into recent_count from public.public_comments where visitor_id=p_visitor_id and created_at > now()-interval '1 hour';
  select count(*) into ip_recent_count from public.security_events where event_type='comment_submitted' and ip_hash=p_ip_hash and created_at > now()-interval '1 hour';
  if recent_count >= 5 or (p_ip_hash is not null and ip_recent_count >= 30) then
    insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'rate_limited');
    select count(*) into repeat_limit_count from public.security_events where visitor_id=p_visitor_id and event_type='rate_limited' and created_at > now()-interval '24 hours';
    if repeat_limit_count >= 5 then
      select count(*) into previous_bans from public.visitor_bans where visitor_id=p_visitor_id;
      if previous_bans < 3 then
        ban_days := case previous_bans when 0 then 1 when 1 then 3 else 7 end;
        insert into public.visitor_bans(visitor_id,ip_hash,reason,expires_at,created_by)
        values(p_visitor_id,p_ip_hash,'Repeated rate-limit violations',now() + make_interval(days => ban_days),'system');
        insert into public.visitor_abuse(visitor_id,ip_hash,offense_count,serious_offense_count,previous_ban_restriction,last_offense_at)
        values(p_visitor_id,p_ip_hash,1,1,true,now())
        on conflict(visitor_id) do update set ip_hash=excluded.ip_hash, offense_count=public.visitor_abuse.offense_count+1,
          serious_offense_count=public.visitor_abuse.serious_offense_count+1, previous_ban_restriction=true,last_offense_at=now(),updated_at=now();
        insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'ban_issued');
        insert into public.security_audit_logs(action,visitor_id,detail) values('automatic_temporary_ban',p_visitor_id,jsonb_build_object('days',ban_days,'basis','repeated_rate_limits'));
      else
        insert into public.visitor_abuse(visitor_id,ip_hash,offense_count,serious_offense_count,previous_ban_restriction,last_offense_at)
        values(p_visitor_id,p_ip_hash,1,3,true,now())
        on conflict(visitor_id) do update set ip_hash=excluded.ip_hash, offense_count=public.visitor_abuse.offense_count+1,
          serious_offense_count=greatest(public.visitor_abuse.serious_offense_count+1,3), previous_ban_restriction=true,last_offense_at=now(),updated_at=now();
        insert into public.security_audit_logs(action,visitor_id,detail) values('visitor_flagged_for_admin_review',p_visitor_id,jsonb_build_object('basis','persistent_rate_limits'));
      end if;
    end if;
    return jsonb_build_object('accepted',false,'reason','rate_limited');
  end if;
  held := coalesce(abuse.previous_ban_restriction,false);
  insert into public.public_comments(visitor_id,display_name,body,status,held_for_review)
  values(p_visitor_id,trim(p_display_name),trim(p_body),case when held then 'pending' else 'approved' end,held)
  returning id into result_id;
  insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'comment_submitted');
  return jsonb_build_object('accepted',true,'held_for_review',held,'id',result_id);
end $$;
revoke all on function public.submit_public_comment(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_public_comment(uuid,text,text,text) to service_role;
