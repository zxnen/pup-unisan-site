-- One-time setup: replace with the email of an existing confirmed campus account.
-- Run only in the main website project's SQL editor after migrations 001-003.
do $$
declare target_email text := 'REPLACE_WITH_CONFIRMED_ADMIN_EMAIL';
        updated_count integer;
begin
  update public.profiles p
     set role='admin', approval_status='approved', reviewed_at=now()
    from auth.users u
   where p.id=u.id and lower(u.email)=lower(target_email) and u.email_confirmed_at is not null;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Expected exactly one confirmed account; updated % rows.', updated_count; end if;
end $$;
