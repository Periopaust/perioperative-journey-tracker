-- Shared Australian Medical AI Pipeline: correction store schema (spec Section 2).
-- Same four tables are used across Jarrah, Clinical Prompt, Ward Voicenotes,
-- Periop Journey Tracker, Telecare Assistant, and the Billing and Sticker app.
-- This project reads/writes rows scoped to app_name = 'periop_journey_tracker',
-- but the tables are shaped so they can point at one shared Postgres instance
-- later without changes.

-- Canonical dictionary of known terms (medications, abbreviations, hospital jargon)
create table if not exists dictionary_terms (
  id uuid primary key default gen_random_uuid(),
  canonical_term text not null,
  term_type text not null check (term_type in ('medication', 'abbreviation', 'jargon')),
  expansion text,
  source text,
  confidence numeric not null default 1.0,
  times_seen int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dictionary_terms_unique unique (canonical_term, term_type)
);

-- Known mishearing/variant → canonical term mappings
create table if not exists term_variants (
  id uuid primary key default gen_random_uuid(),
  variant_text text not null,
  canonical_term_id uuid references dictionary_terms(id) on delete cascade,
  times_seen int not null default 1,
  constraint term_variants_variant_text_unique unique (variant_text)
);

-- Raw user corrections, logged every time a user edits AI output
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  app_name text not null default 'periop_journey_tracker'
    check (app_name in (
      'jarrah', 'clinical_prompt', 'ward_voicenotes',
      'periop_journey_tracker', 'telecare_assistant', 'billing_sticker_app'
    )),
  original_text text not null,
  corrected_text text not null,
  context_snippet text,
  user_id text,
  created_at timestamptz not null default now(),
  promoted boolean not null default false
);

-- Per-app config: which system prompt + which output structure to use
create table if not exists app_configs (
  app_name text primary key,
  system_prompt text not null,
  output_structure text not null,
  updated_at timestamptz not null default now()
);

create index if not exists term_variants_canonical_idx on term_variants (canonical_term_id);
create index if not exists corrections_app_name_idx on corrections (app_name);
create index if not exists corrections_unpromoted_idx on corrections (promoted) where promoted = false;
create index if not exists dictionary_terms_canonical_idx on dictionary_terms (canonical_term);

alter table dictionary_terms enable row level security;
alter table term_variants enable row level security;
alter table corrections enable row level security;
alter table app_configs enable row level security;

-- Dictionary + variants: readable/writable by any authenticated user, same as the
-- existing vocabulary_corrections table this supersedes.
create policy "dictionary_terms_select" on dictionary_terms
  for select using (auth.uid() is not null);
create policy "dictionary_terms_write" on dictionary_terms
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "term_variants_select" on term_variants
  for select using (auth.uid() is not null);
create policy "term_variants_write" on term_variants
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Corrections: any authenticated user can log a correction; only admins can mark
-- rows as promoted (that's what the promotion job does).
create policy "corrections_select" on corrections
  for select using (auth.uid() is not null);
create policy "corrections_insert" on corrections
  for insert with check (auth.uid() is not null);
create policy "corrections_update_promote" on corrections
  for update using (current_user_role() = 'admin');

-- App configs: readable by all authenticated users, editable by admins only.
create policy "app_configs_select" on app_configs
  for select using (auth.uid() is not null);
create policy "app_configs_write" on app_configs
  for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- Migrate existing vocabulary_corrections rows (this app's original, simpler
-- correction table) into the shared dictionary_terms / term_variants shape so
-- preprocess() has one place to read from going forward. vocabulary_corrections
-- itself is left in place — the "Teach" UI still writes to it, and preprocess()
-- still consults it directly — this migration just backfills the shared tables.
insert into dictionary_terms (canonical_term, term_type, source)
select distinct
  vc.correct_term,
  case vc.category when 'medication' then 'medication' else 'jargon' end,
  'migrated_vocabulary_corrections'
from vocabulary_corrections vc
on conflict (canonical_term, term_type) do nothing;

insert into term_variants (variant_text, canonical_term_id, times_seen)
select vc.wrong_term, dt.id, 1
from vocabulary_corrections vc
join dictionary_terms dt
  on dt.canonical_term = vc.correct_term
  and dt.term_type = case vc.category when 'medication' then 'medication' else 'jargon' end
on conflict (variant_text) do nothing;

-- Seed common Australian perioperative terms directly into the shared dictionary
-- (mirrors the hard-coded lists previously duplicated across periop-extract.ts /
-- ward/dictate/route.ts system prompts).
insert into dictionary_terms (canonical_term, term_type, expansion, source) values
  ('Palexia', 'medication', 'tapentadol, opioid analgesic', 'seed'),
  ('Targin', 'medication', 'oxycodone/naloxone', 'seed'),
  ('Endone', 'medication', 'oxycodone immediate release', 'seed'),
  ('Karvezide', 'medication', 'irbesartan/HCTZ', 'seed'),
  ('Notan', 'medication', 'atenolol brand', 'seed'),
  ('Vytorin', 'medication', 'ezetimibe/simvastatin', 'seed'),
  ('Lyrica', 'medication', 'pregabalin', 'seed'),
  ('Mobic', 'medication', 'meloxicam', 'seed'),
  ('Slinda', 'medication', 'progesterone-only contraceptive pill', 'seed'),
  ('Ozempic', 'medication', 'semaglutide', 'seed'),
  ('Jardiance', 'medication', 'empagliflozin', 'seed'),
  ('Eliquis', 'medication', 'apixaban', 'seed'),
  ('Xarelto', 'medication', 'rivaroxaban', 'seed'),
  ('CAP', 'abbreviation', 'Community Acquired Pneumonia', 'seed'),
  ('HITH', 'abbreviation', 'Hospital In The Home', 'seed'),
  ('AMU', 'abbreviation', 'Acute Medical Unit', 'seed'),
  ('NFR', 'abbreviation', 'Not For Resuscitation', 'seed'),
  ('CMO', 'abbreviation', 'Comfort Measures Only', 'seed'),
  ('MET call', 'abbreviation', 'Medical Emergency Team call', 'seed')
on conflict (canonical_term, term_type) do nothing;

-- Seed per-app config: system prompt template (Section 4) filled in for this app.
insert into app_configs (app_name, system_prompt, output_structure)
values (
  'periop_journey_tracker',
  $prompt$You are an AI assistant supporting Australian clinicians with perioperative patient journey summaries, ward documentation, and handover.
Rules:
- Use Australian English spelling throughout.
- Never invent or guess medication names — if a drug name is unclear or not in the
  provided dictionary, flag it as [UNCLEAR: original text] rather than substituting a guess.
- Prefer concise, clinical language consistent with Australian hospital documentation norms.
- If information is missing or uncertain, state that explicitly rather than fabricating it.
- Expand only abbreviations not already resolved in the input; do not over-expand accepted
  clinical shorthand (e.g. leave "BD", "PRN", "STAT" as-is).
Output format: perioperative handover / structured clinical note (SOAP, ward round plan,
handover, or discharge summary, depending on the requested document type).$prompt$,
  'perioperative_handover'
)
on conflict (app_name) do update set
  system_prompt = excluded.system_prompt,
  output_structure = excluded.output_structure,
  updated_at = now();
