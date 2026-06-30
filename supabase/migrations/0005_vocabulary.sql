-- Vocabulary corrections: wrong term → correct term, learned from user edits
create table if not exists vocabulary_corrections (
  id uuid primary key default gen_random_uuid(),
  wrong_term text not null,
  correct_term text not null,
  category text not null default 'general'
    check (category in ('medication', 'institution', 'person', 'clinical', 'general')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vocabulary_corrections_wrong_term_unique unique (wrong_term)
);

alter table vocabulary_corrections enable row level security;

-- All authenticated users can read corrections
create policy "vocabulary_corrections_select"
  on vocabulary_corrections for select
  to authenticated using (true);

-- Authenticated users can insert their own corrections
create policy "vocabulary_corrections_insert"
  on vocabulary_corrections for insert
  to authenticated with check (auth.uid() = created_by);

-- Authenticated users can update any correction (shared vocabulary)
create policy "vocabulary_corrections_update"
  on vocabulary_corrections for update
  to authenticated using (true);

-- Seed initial Australian clinical corrections
insert into vocabulary_corrections (wrong_term, correct_term, category, created_by)
values
  ('carbizide',   'Karvezide',      'medication',    null),
  ('karbizide',   'Karvezide',      'medication',    null),
  ('carbezide',   'Karvezide',      'medication',    null),
  ('doctor bora', 'Dr Vohra',       'person',        null),
  ('dr bora',     'Dr Vohra',       'person',        null),
  ('dr vora',     'Dr Vohra',       'person',        null),
  ('doctor vora', 'Dr Vohra',       'person',        null),
  ('apixa ban',   'apixaban',       'medication',    null),
  ('rivoroxaban', 'rivaroxaban',    'medication',    null),
  ('plavix',      'Plavix',         'medication',    null),
  ('lyrica',      'Lyrica',         'medication',    null),
  ('vytorin',     'Vytorin',        'medication',    null),
  ('notan',       'Notan',          'medication',    null),
  ('robinville',  'Robinvale',      'institution',   null),
  ('robin oil',   'Robinvale',      'institution',   null),
  ('robin wall',  'Robinvale',      'institution',   null)
on conflict (wrong_term) do nothing;
