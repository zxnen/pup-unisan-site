-- Public inquiry submission through a server-only Netlify function.
-- Existing status values and administrator read/update/delete policies remain intact.
alter table public.inquiries alter column user_id drop not null;
alter table public.inquiries add column if not exists full_name text;
alter table public.inquiries add column if not exists email text;
alter table public.inquiries add column if not exists visitor_id uuid;
alter table public.inquiries add column if not exists requires_review boolean not null default false;
alter table public.inquiries add constraint inquiries_public_contact_check
  check ((full_name is null or length(full_name) between 2 and 120)
     and (email is null or length(email) between 3 and 254));
create index if not exists inquiries_email_created_idx on public.inquiries(lower(email), created_at desc);
create index if not exists inquiries_visitor_created_idx on public.inquiries(visitor_id, created_at desc);

drop policy if exists "approved students create own inquiry" on public.inquiries;
revoke insert on public.inquiries from anon, authenticated;
revoke insert(category,subject,message,phone,program_of_interest,preferred_contact) on public.inquiries from anon, authenticated;
revoke all on public.inquiries from anon;
grant select, delete on public.inquiries to authenticated;
grant update(status,admin_response,requires_review) on public.inquiries to authenticated;

alter table public.security_events drop constraint if exists security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check
  check (event_type in ('captcha_failed','rate_limited','blocked_ban','comment_submitted','ban_issued',
    'inquiry_captcha_failed','inquiry_rate_limited','inquiry_blocked_ban','inquiry_submitted'));

create or replace function public.submit_public_inquiry(
  p_user_id uuid,
  p_visitor_id uuid,
  p_ip_hash text,
  p_full_name text,
  p_email text,
  p_category text,
  p_subject text,
  p_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  abuse public.visitor_abuse;
  result_id uuid;
  review_required boolean := false;
  recent_count integer;
  ip_recent_count integer;
  email_recent_count integer;
  duplicate_count integer;
  repeat_limit_count integer;
  previous_bans integer;
  ban_days integer;
  active_ban boolean;
begin
  if p_visitor_id is null or length(trim(p_full_name)) not between 2 and 120
     or length(trim(p_email)) not between 3 and 254
     or trim(p_email) !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
     or p_category not in ('admissions','general')
     or length(trim(p_subject)) not between 3 and 120
     or length(coalesce(p_message,'')) > 2000 then
    raise exception 'Invalid inquiry';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_visitor_id::text, 0));
  select * into abuse from public.visitor_abuse where visitor_id=p_visitor_id for update;
  select exists(select 1 from public.visitor_bans b where b.visitor_id=p_visitor_id and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())) into active_ban;
  if active_ban then
    insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'inquiry_blocked_ban');
    return jsonb_build_object('accepted',false,'reason','banned');
  end if;

  select count(*) into recent_count from public.inquiries where visitor_id=p_visitor_id and created_at > now()-interval '1 hour';
  select count(*) into ip_recent_count from public.security_events where event_type='inquiry_submitted' and p_ip_hash is not null and ip_hash=p_ip_hash and created_at > now()-interval '1 hour';
  select count(*) into email_recent_count from public.inquiries where lower(email)=lower(trim(p_email)) and created_at > now()-interval '1 hour';
  select count(*) into duplicate_count from public.inquiries where lower(email)=lower(trim(p_email)) and lower(message)=lower(coalesce(trim(p_message),'')) and created_at > now()-interval '10 minutes';
  if recent_count >= 3 or (p_ip_hash is not null and ip_recent_count >= 20) or email_recent_count >= 5 or duplicate_count >= 2 then
    insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'inquiry_rate_limited');
    select count(*) into repeat_limit_count from public.security_events where visitor_id=p_visitor_id and event_type='inquiry_rate_limited' and created_at > now()-interval '24 hours';
    if repeat_limit_count >= 5 then
      select count(*) into previous_bans from public.visitor_bans where visitor_id=p_visitor_id;
      if previous_bans < 3 then
        ban_days := case previous_bans when 0 then 1 when 1 then 3 else 7 end;
        insert into public.visitor_bans(visitor_id,ip_hash,reason,expires_at,created_by)
          values(p_visitor_id,p_ip_hash,'Repeated public inquiry rate-limit violations',now() + make_interval(days => ban_days),'system');
        insert into public.visitor_abuse(visitor_id,ip_hash,offense_count,serious_offense_count,previous_ban_restriction,last_offense_at)
          values(p_visitor_id,p_ip_hash,1,1,true,now())
          on conflict(visitor_id) do update set ip_hash=excluded.ip_hash, offense_count=public.visitor_abuse.offense_count+1,
            serious_offense_count=public.visitor_abuse.serious_offense_count+1,previous_ban_restriction=true,last_offense_at=now(),updated_at=now();
        insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'ban_issued');
        insert into public.security_audit_logs(action,visitor_id,detail) values('automatic_temporary_ban',p_visitor_id,jsonb_build_object('days',ban_days,'basis','public_inquiry_rate_limits'));
      else
        insert into public.visitor_abuse(visitor_id,ip_hash,offense_count,serious_offense_count,previous_ban_restriction,last_offense_at)
          values(p_visitor_id,p_ip_hash,1,3,true,now())
          on conflict(visitor_id) do update set ip_hash=excluded.ip_hash,offense_count=public.visitor_abuse.offense_count+1,
            serious_offense_count=greatest(public.visitor_abuse.serious_offense_count+1,3),previous_ban_restriction=true,last_offense_at=now(),updated_at=now();
        insert into public.security_audit_logs(action,visitor_id,detail) values('visitor_flagged_for_admin_review',p_visitor_id,jsonb_build_object('basis','public_inquiry_rate_limits'));
      end if;
    end if;
    return jsonb_build_object('accepted',false,'reason','rate_limited');
  end if;

  review_required := coalesce(abuse.previous_ban_restriction,false) or exists(select 1 from public.visitor_bans where visitor_id=p_visitor_id);
  insert into public.inquiries(user_id,visitor_id,full_name,email,category,subject,message,requires_review)
    values(p_user_id,p_visitor_id,trim(p_full_name),lower(trim(p_email)),p_category,trim(p_subject),coalesce(trim(p_message),''),review_required)
    returning id into result_id;
  insert into public.security_events(visitor_id,ip_hash,event_type) values(p_visitor_id,p_ip_hash,'inquiry_submitted');
  return jsonb_build_object('accepted',true,'requires_review',review_required,'id',result_id);
end $$;

revoke all on function public.submit_public_inquiry(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_public_inquiry(uuid,uuid,text,text,text,text,text,text) to service_role;
