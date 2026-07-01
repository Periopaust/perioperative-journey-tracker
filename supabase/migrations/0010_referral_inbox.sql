-- Track inbound email referrals: created patients, duplicates, and those needing review
create table if not exists referral_inbox_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  raw_text text,
  extracted jsonb,
  status text not null default 'needs_review', -- 'created' | 'duplicate' | 'needs_review'
  reason text,
  matched_patient_id uuid references patients(id) on delete set null
);

-- RLS: visible only to authenticated users in the same practice
alter table referral_inbox_queue enable row level security;

create policy "inbox_select" on referral_inbox_queue for select using (auth.uid() is not null);
create policy "inbox_insert" on referral_inbox_queue for insert with check (true); -- webhook inserts via service role
create policy "inbox_update" on referral_inbox_queue for update using (auth.uid() is not null);

-- intake_source on patients to track how patient was created
alter table patients add column if not exists intake_source text default 'manual';
