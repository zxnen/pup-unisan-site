do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.faculty'::regclass) then raise exception 'faculty RLS is disabled'; end if;
  if not has_table_privilege('anon','public.faculty','select') then raise exception 'anon cannot read faculty'; end if;
  if has_table_privilege('anon','public.faculty','insert') or has_table_privilege('authenticated','public.faculty','update') then raise exception 'client can modify faculty directly'; end if;
  raise notice 'Faculty project privilege checks passed.';
end $$;
