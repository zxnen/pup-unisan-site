-- Main website project only: users, programs, announcements and authenticated inquiries.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  student_number text unique,
  program text,
  year smallint check (year between 1 and 5),
  phone text,
  address text,
  birthdate date,
  role text not null default 'student' check (role in ('student','admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  title text not null,
  level text not null check (level in ('Certificate','Diploma','Bachelor','Master','Doctorate')),
  description text,
  image_url text,
  display_order integer not null default 0,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('homepage_hero_title','homepage_hero_tagline','homepage_hero_image_url','brand_logo_url','campus_motto','campus_established')),
  value text not null default '',
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category text not null,
  subject text not null,
  message text not null,
  phone text,
  program_of_interest text,
  preferred_contact text,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inquiries_user_created_idx on public.inquiries(user_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.programs for each row execute function public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger site_settings_updated_at before update on public.site_settings for each row execute function public.set_updated_at();
create trigger inquiries_updated_at before update on public.inquiries for each row execute function public.set_updated_at();

create or replace function public.maintain_published_at() returns trigger language plpgsql as $$
begin
  if new.is_published then
    if tg_op = 'INSERT' or old.is_published is distinct from new.is_published or new.published_at is null then new.published_at = now(); end if;
  else
    new.published_at = null;
  end if;
  return new;
end $$;
create trigger programs_published_at before insert or update of is_published on public.programs for each row execute function public.maintain_published_at();
create trigger announcements_published_at before insert or update of is_published on public.announcements for each row execute function public.maintain_published_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.approval_status = 'approved')
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name, role, approval_status)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''), 'student', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.ensure_profile() returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.profiles(id,email,full_name,role,approval_status)
    select u.id,coalesce(u.email,''),coalesce(u.raw_user_meta_data->>'full_name',''),'student','pending'
    from auth.users u where u.id=auth.uid() on conflict(id) do nothing;
  select * into result from public.profiles where id=auth.uid();
  return result;
end $$;
grant execute on function public.ensure_profile() to authenticated;

create or replace function public.review_student(target uuid, new_status text) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if new_status not in ('approved','rejected','pending') then raise exception 'Invalid status'; end if;
  if target = auth.uid() then raise exception 'Cannot review your own account'; end if;
  update public.profiles set approval_status=new_status, reviewed_at=now(), reviewed_by=auth.uid()
    where id=target and role='student' returning * into result;
  if result.id is null then raise exception 'Student not found'; end if;
  return result;
end $$;
grant execute on function public.review_student(uuid,text) to authenticated;
