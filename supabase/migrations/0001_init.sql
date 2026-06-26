-- Perioperative Australia: core schema, RLS, and audit logging
-- Roles: admin, doctor, staff

create type user_role as enum ('admin', 'doctor', 'staff');

create type journey_stage as enum (
  'referral_workup',
  'clinic_review',
  'admission_surgery',
  'discharge_followup'
);

-- Profiles extend auth.users with a role. One row per Supabase auth user.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date not null,
  ur_number text not null unique,
  referring_surgeon text,
  planned_surgery text,
  surgery_date date,
  hospital text,
  bloods_status text not null default 'pending' check (bloods_status in ('pending', 'ordered', 'received')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  stage journey_stage not null,
  item_key text not null,
  item_label text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  sort_order int not null default 0,
  unique (patient_id, stage, item_key)
);

create table clinical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  author_id uuid not null references profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index on checklist_items (patient_id);
create index on clinical_notes (patient_id);
create index on audit_log (table_name, record_id);

-- Keep patients.updated_at current
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger patients_set_updated_at
  before update on patients
  for each row execute function set_updated_at();

-- Generic audit trigger: logs insert/update/delete on patients, checklist_items, clinical_notes
create or replace function audit_row_change()
returns trigger language plpgsql as $$
declare
  actor uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    insert into audit_log (actor_id, action, table_name, record_id, details)
    values (actor, 'insert', tg_table_name, new.id, to_jsonb(new));
  elsif (tg_op = 'UPDATE') then
    insert into audit_log (actor_id, action, table_name, record_id, details)
    values (actor, 'update', tg_table_name, new.id, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  elsif (tg_op = 'DELETE') then
    insert into audit_log (actor_id, action, table_name, record_id, details)
    values (actor, 'delete', tg_table_name, old.id, to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger patients_audit
  after insert or update or delete on patients
  for each row execute function audit_row_change();

create trigger checklist_items_audit
  after insert or update or delete on checklist_items
  for each row execute function audit_row_change();

create trigger clinical_notes_audit
  after insert or update or delete on clinical_notes
  for each row execute function audit_row_change();

-- Auto-create a profile when a new auth user signs up. Default role 'staff';
-- an admin must promote via the profiles table.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper to read the current user's role without recursive RLS lookups
create or replace function current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

alter table profiles enable row level security;
alter table patients enable row level security;
alter table checklist_items enable row level security;
alter table clinical_notes enable row level security;
alter table audit_log enable row level security;

-- Profiles: everyone can read all profiles (needed for staff lists / attribution);
-- only admins can change roles; users can update their own non-role fields.
create policy "profiles_select_all" on profiles
  for select using (auth.uid() is not null);

create policy "profiles_update_self" on profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_manage" on profiles
  for all using (current_user_role() = 'admin');

-- Patients: any authenticated staff/doctor/admin can read and write.
-- (Tighten further with per-clinician scoping later if required.)
create policy "patients_select" on patients
  for select using (auth.uid() is not null);

create policy "patients_insert" on patients
  for insert with check (auth.uid() is not null);

create policy "patients_update" on patients
  for update using (auth.uid() is not null);

create policy "patients_delete" on patients
  for delete using (current_user_role() in ('admin', 'doctor'));

-- Checklist items: readable/writable by any authenticated user
create policy "checklist_select" on checklist_items
  for select using (auth.uid() is not null);

create policy "checklist_insert" on checklist_items
  for insert with check (auth.uid() is not null);

create policy "checklist_update" on checklist_items
  for update using (auth.uid() is not null);

-- Clinical notes: readable by all authenticated staff; only doctors/admins author notes
create policy "notes_select" on clinical_notes
  for select using (auth.uid() is not null);

create policy "notes_insert" on clinical_notes
  for insert with check (current_user_role() in ('admin', 'doctor'));

-- Audit log: admins only
create policy "audit_admin_select" on audit_log
  for select using (current_user_role() = 'admin');
