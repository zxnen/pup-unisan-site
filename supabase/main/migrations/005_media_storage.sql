-- Publicly retrievable campus image library with administrator-only write access.
-- Apply in the main website Supabase project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site media public read" on storage.objects;
create policy "admins list site media" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.is_admin());
drop policy if exists "admins upload site media" on storage.objects;
create policy "admins upload site media" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());
drop policy if exists "admins update site media" on storage.objects;
create policy "admins update site media" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.is_admin())
  with check (bucket_id = 'site-media' and public.is_admin());
drop policy if exists "admins delete site media" on storage.objects;
create policy "admins delete site media" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.is_admin());

drop trigger if exists log_site_media_insert on storage.objects;
create trigger log_site_media_insert after insert on storage.objects
  for each row when (new.bucket_id = 'site-media') execute function public.log_admin_activity();
drop trigger if exists log_site_media_update on storage.objects;
create trigger log_site_media_update after update on storage.objects
  for each row when (new.bucket_id = 'site-media') execute function public.log_admin_activity();
drop trigger if exists log_site_media_delete on storage.objects;
create trigger log_site_media_delete after delete on storage.objects
  for each row when (old.bucket_id = 'site-media') execute function public.log_admin_activity();
