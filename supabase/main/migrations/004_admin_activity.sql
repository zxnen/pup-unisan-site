-- Record administrator changes made through the main Supabase project.
-- Apply after 003_public_security.sql in the main project.
create table if not exists public.admin_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity text not null,
  entity_id text,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);
create index if not exists admin_activity_created_idx on public.admin_activity(created_at desc);
alter table public.admin_activity enable row level security;
revoke all on public.admin_activity from anon, authenticated;
grant select on public.admin_activity to authenticated;
create policy "admins read administrative activity" on public.admin_activity
  for select to authenticated using (public.is_admin());

create or replace function public.log_admin_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_id text;
begin
  if not public.is_admin() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then target_id := old.id::text; else target_id := new.id::text; end if;
  insert into public.admin_activity(actor_id, entity, entity_id, operation)
    values(auth.uid(), tg_table_name, target_id, tg_op);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.log_admin_activity() from public, anon, authenticated;

drop trigger if exists log_program_admin_activity on public.programs;
create trigger log_program_admin_activity after insert or update or delete on public.programs
  for each row execute function public.log_admin_activity();
drop trigger if exists log_announcement_admin_activity on public.announcements;
create trigger log_announcement_admin_activity after insert or update or delete on public.announcements
  for each row execute function public.log_admin_activity();
drop trigger if exists log_site_setting_admin_activity on public.site_settings;
create trigger log_site_setting_admin_activity after insert or update or delete on public.site_settings
  for each row execute function public.log_admin_activity();
drop trigger if exists log_profile_admin_activity on public.profiles;
create trigger log_profile_admin_activity after update on public.profiles
  for each row execute function public.log_admin_activity();
drop trigger if exists log_inquiry_admin_activity on public.inquiries;
create trigger log_inquiry_admin_activity after update or delete on public.inquiries
  for each row execute function public.log_admin_activity();
