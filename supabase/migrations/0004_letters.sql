-- Pre-operative AI-drafted letters, linked to the existing patients table.

create table letters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  letter_code text unique not null,
  procedure_type text,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'sent')),
  docx_path text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index on letters (patient_id);

alter table letters enable row level security;

create policy "letters_select" on letters
  for select using (auth.uid() is not null);

create policy "letters_insert" on letters
  for insert with check (auth.uid() is not null);

create policy "letters_update" on letters
  for update using (auth.uid() is not null);

create trigger letters_audit
  after insert or update or delete on letters
  for each row execute function audit_row_change();

-- Storage: the "patient-letters" bucket already exists (private) in this
-- project. Allow any authenticated user to upload and read the generated
-- .docx files via the user's own session (no service-role key needed).
create policy "patient_letters_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-letters');

create policy "patient_letters_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-letters');
