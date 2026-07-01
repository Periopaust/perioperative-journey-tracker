-- Add ward fields to patients
alter table patients add column if not exists ward_location text;
alter table patients add column if not exists problem_list text[] default '{}';

-- Ward notes table
create table if not exists ward_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade not null,
  author_id uuid references auth.users(id) not null,
  author_name text,
  note_type text not null default 'Progress note',
  note_text text not null,
  created_at timestamptz default now()
);

alter table ward_notes enable row level security;

create policy "ward_notes_select" on ward_notes
  for select using (can_access_patient(patient_id));

create policy "ward_notes_insert" on ward_notes
  for insert with check (can_access_patient(patient_id) and author_id = auth.uid());

create policy "ward_notes_delete" on ward_notes
  for delete using (author_id = auth.uid());
