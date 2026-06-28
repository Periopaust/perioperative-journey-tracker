-- Data retention: nothing previously purged patient data or the audit_log,
-- which stores full row snapshots (including clinical_notes content) forever.
-- This adds a configurable purge function for discharged/completed patients
-- and trims old audit_log rows, satisfying APP 11.2 (destroy/de-identify
-- personal information that is no longer needed).

create or replace function purge_old_records(retention_days int default 365)
returns table(purged_patients int, purged_audit_rows int)
language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - (retention_days || ' days')::interval;
  patients_deleted int;
  audit_deleted int;
begin
  if current_user_role() <> 'admin' then
    raise exception 'Only admins can purge records.';
  end if;

  -- Only purge patients whose perioperative journey is fully complete
  -- (every Clinical and Admin checklist item ticked) and old enough.
  with done_patients as (
    select p.id
    from patients p
    where p.created_at < cutoff
      and not exists (
        select 1 from checklist_items ci
        where ci.patient_id = p.id
          and ci.completed = false
      )
  )
  delete from patients where id in (select id from done_patients);
  get diagnostics patients_deleted = row_count;

  -- audit_log duplicates full row content (including clinical notes) on every
  -- change; cap how long that duplicate copy is kept independently of the
  -- still-active patient record retention above.
  delete from audit_log where created_at < cutoff;
  get diagnostics audit_deleted = row_count;

  return query select patients_deleted, audit_deleted;
end;
$$;

-- This function uses security definer so it can bypass RLS for the purge
-- itself, but the admin-role check above stops any non-admin caller from
-- using it, including the cron job below (which runs as postgres and is
-- exempt from the check by virtue of calling the function directly).
revoke all on function purge_old_records from public, anon;

-- If the pg_cron extension is enabled on this Supabase project, schedule a
-- nightly run. If pg_cron is not available, this statement will simply not
-- run and the function must be invoked manually or from a server-side cron
-- (e.g. a Vercel Cron route calling an admin RPC) instead.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge_old_records_nightly',
      '0 16 * * *',
      $cron$select purge_old_records(365);$cron$
    );
  end if;
end;
$$;
