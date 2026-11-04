-- Publicly retrievable faculty portraits in the faculty project's own storage.
-- Listing, uploads and deletes are proxied through the main-site admin-verifying function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faculty-media', 'faculty-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
