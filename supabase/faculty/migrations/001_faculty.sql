-- Independent faculty Supabase project. This file is applied only to the faculty project.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  position text not null check (length(position) between 1 and 120),
  department text not null check (length(department) between 1 and 120),
  group_label text,
  email text,
  bio text,
  image_url text,
  qualifications text,
  professional_info text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faculty enable row level security;
create policy "faculty is public to read" on public.faculty for select to anon, authenticated using (true);
-- Changes are performed through the trusted admin backend after it validates the main-site admin.
revoke insert, update, delete on public.faculty from anon, authenticated;
grant select on public.faculty to anon, authenticated;
