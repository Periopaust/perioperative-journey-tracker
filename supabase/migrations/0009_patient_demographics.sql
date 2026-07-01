-- Comprehensive patient demographics
alter table patients
  -- Name
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists middle_name text,
  add column if not exists preferred_name text,

  -- Identity (Australian health standards)
  add column if not exists gender text,
  add column if not exists sex_at_birth text,
  add column if not exists pronouns text,
  add column if not exists sexual_orientation text,
  add column if not exists indigenous_status text,

  -- Contact
  add column if not exists mobile text,
  add column if not exists home_phone text,
  add column if not exists work_phone text,
  add column if not exists email text,
  add column if not exists fax text,
  add column if not exists preferred_contact text default 'mobile',

  -- Address
  add column if not exists address_line1 text,
  add column if not exists address_suburb text,
  add column if not exists address_state text,
  add column if not exists address_postcode text,
  add column if not exists address_country text default 'Australia',

  -- Medicare & insurance
  add column if not exists medicare_number text,
  add column if not exists medicare_irn text,
  add column if not exists medicare_expiry text,
  add column if not exists dva_number text,
  add column if not exists dva_card_colour text,
  add column if not exists health_fund text,
  add column if not exists health_fund_number text,
  add column if not exists health_fund_expiry text,

  -- Next of kin / emergency contact
  add column if not exists nok_name text,
  add column if not exists nok_relationship text,
  add column if not exists nok_phone text,
  add column if not exists nok_email text,

  -- Additional
  add column if not exists occupation text,
  add column if not exists country_of_birth text,
  add column if not exists language text,
  add column if not exists interpreter_required boolean default false,
  add column if not exists concession_type text,
  add column if not exists concession_number text;
