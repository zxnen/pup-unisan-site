-- Run after all main-project migrations in a non-production project.
do $$
declare
  check_value boolean;
begin
  if not (select relrowsecurity from pg_class where oid='public.profiles'::regclass) then raise exception 'profiles RLS is disabled'; end if;
  if not (select relrowsecurity from pg_class where oid='public.inquiries'::regclass) then raise exception 'inquiries RLS is disabled'; end if;
  if has_table_privilege('anon','public.profiles','select') then raise exception 'anon can read profiles'; end if;
  if has_table_privilege('anon','public.inquiries','select') then raise exception 'anon can read inquiries'; end if;
  if has_table_privilege('anon','public.inquiries','insert') then raise exception 'anon can insert directly into inquiries'; end if;
  if has_table_privilege('anon','public.inquiries','update') or has_table_privilege('anon','public.inquiries','delete') then raise exception 'anon can modify inquiries'; end if;
  if has_table_privilege('authenticated','public.inquiries','insert') then raise exception 'authenticated clients can bypass inquiry submission function'; end if;
  if has_column_privilege('authenticated','public.inquiries','category','insert') then raise exception 'authenticated can directly insert inquiry columns'; end if;
  if has_function_privilege('anon','public.submit_public_inquiry(uuid,uuid,text,text,text,text,text,text)','execute') then raise exception 'anon can call privileged inquiry RPC'; end if;
  if not has_function_privilege('service_role','public.submit_public_inquiry(uuid,uuid,text,text,text,text,text,text)','execute') then raise exception 'service role cannot call inquiry RPC'; end if;
  if not exists(select 1 from pg_attribute where attrelid='public.inquiries'::regclass and attname='user_id' and not attnotnull) then raise exception 'inquiry user_id must allow public inquiries'; end if;
  if has_column_privilege('authenticated','public.profiles','role','update') then raise exception 'authenticated can update role'; end if;
  if has_column_privilege('authenticated','public.profiles','approval_status','update') then raise exception 'authenticated can update approval status'; end if;
  if has_function_privilege('anon','public.submit_public_comment(uuid,text,text,text)','execute') then raise exception 'anon can call privileged comment RPC'; end if;
  if not has_table_privilege('anon','public.public_comments','select') then raise exception 'anon cannot read approved comments'; end if;
  if has_table_privilege('anon','public.visitor_bans','select') then raise exception 'anon can read bans'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='public_comments' and policyname='approved comments are public') then raise exception 'public comment policy missing'; end if;
  raise notice 'Main project privilege checks passed.';
end $$;
