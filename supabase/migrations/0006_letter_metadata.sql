-- Add letter composition metadata fields
alter table letters
  add column if not exists priority text not null default 'routine' check (priority in ('routine', 'urgent')),
  add column if not exists letter_to text not null default 'doctor' check (letter_to in ('doctor', 'patient')),
  add column if not exists recipient_name text,
  add column if not exists recipient_address text,
  add column if not exists cc text,
  add column if not exists template text;
