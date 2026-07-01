-- ── Patient sharing ──────────────────────────────────────────────────────────
-- Each patient belongs to the clinician who created it.
-- Owners can explicitly share patients with other clinicians (clinical access only).
-- Financial data is never included in shared access.

-- Add email to profiles so we can look up by email for sharing invites
alter table profiles add column if not exists email text;

-- Populate email for existing profiles from auth.users (run once)
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Keep profiles.email in sync when users update their auth email
create or replace function sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function sync_profile_email();

-- Also set email when profile is first created from the new-user trigger
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'staff',
    new.email
  )
  on conflict (id) do update set email = new.email;
  return new;
end;
$$;

-- Patient shares table
create table if not exists patient_shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  shared_with_id uuid not null references profiles(id) on delete cascade,
  permission text not null default 'clinical', -- 'clinical' only for now
  created_at timestamptz not null default now(),
  unique(patient_id, shared_with_id)
);

create index on patient_shares (patient_id);
create index on patient_shares (shared_with_id);

alter table patient_shares enable row level security;

create policy "shares_select" on patient_shares for select using (
  owner_id = auth.uid() or shared_with_id = auth.uid()
);
create policy "shares_insert" on patient_shares for insert with check (
  owner_id = auth.uid()
);
create policy "shares_delete" on patient_shares for delete using (
  owner_id = auth.uid()
);

-- ── Helper function ───────────────────────────────────────────────────────────
-- Returns true if the current user can access the given patient.
-- Used in RLS policies for patients and all related tables.

create or replace function can_access_patient(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    -- owner
    exists (select 1 from patients where id = p_patient_id and created_by = auth.uid())
    or
    -- explicitly shared with me
    exists (select 1 from patient_shares where patient_id = p_patient_id and shared_with_id = auth.uid())
    or
    -- admin sees everything
    (select role from profiles where id = auth.uid()) = 'admin'
  );
$$;

-- ── Tighten patient RLS ───────────────────────────────────────────────────────
-- Replace the current wide-open policies with owner+shared access.

drop policy if exists "patients_select" on patients;
create policy "patients_select" on patients for select using (
  created_by = auth.uid()
  or id in (select patient_id from patient_shares where shared_with_id = auth.uid())
  or current_user_role() = 'admin'
);

drop policy if exists "patients_update" on patients;
create policy "patients_update" on patients for update using (
  created_by = auth.uid() or current_user_role() = 'admin'
);

drop policy if exists "patients_delete" on patients;
create policy "patients_delete" on patients for delete using (
  created_by = auth.uid() or current_user_role() = 'admin'
);

-- ── Letters RLS ───────────────────────────────────────────────────────────────
-- Shared clinicians can read and add letters; only the letter's author can edit/delete.

drop policy if exists "letters_select" on letters;
create policy "letters_select" on letters for select using (
  can_access_patient(patient_id)
);

drop policy if exists "letters_insert" on letters;
create policy "letters_insert" on letters for insert with check (
  can_access_patient(patient_id) and created_by = auth.uid()
);

drop policy if exists "letters_update" on letters;
create policy "letters_update" on letters for update using (
  created_by = auth.uid() or current_user_role() = 'admin'
);

drop policy if exists "letters_delete" on letters;
create policy "letters_delete" on letters for delete using (
  created_by = auth.uid() or current_user_role() = 'admin'
);

-- ── Checklist & notes RLS ─────────────────────────────────────────────────────
drop policy if exists "checklist_select" on checklist_items;
create policy "checklist_select" on checklist_items for select using (
  can_access_patient(patient_id)
);

drop policy if exists "checklist_update" on checklist_items;
create policy "checklist_update" on checklist_items for update using (
  can_access_patient(patient_id)
);

drop policy if exists "notes_select" on clinical_notes;
create policy "notes_select" on clinical_notes for select using (
  can_access_patient(patient_id)
);

drop policy if exists "notes_insert" on clinical_notes;
create policy "notes_insert" on clinical_notes for insert with check (
  can_access_patient(patient_id) and current_user_role() in ('admin', 'doctor')
);
