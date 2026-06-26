-- Replace the 4-stage journey_stage grouping with two checklist categories:
-- Clinical (run by the doctor) and Admin (run by practice staff).

create type checklist_category as enum ('clinical', 'admin');

alter table checklist_items add column category checklist_category;

-- Best-effort mapping of old stages to the new categories so existing rows
-- aren't simply discarded; item sets differ though, so patients created
-- before this migration will be reseeded with the new item list below.
update checklist_items set category = case
  when stage in ('admission_surgery') then 'clinical'
  else 'admin'
end;

alter table checklist_items alter column category set not null;
alter table checklist_items drop column stage;
drop type journey_stage;

alter table checklist_items drop constraint if exists checklist_items_patient_id_stage_item_key_key;
alter table checklist_items add constraint checklist_items_patient_id_item_key_key unique (patient_id, item_key);

-- Reseed every existing patient with the current Clinical/Admin item set so
-- in-progress patients pick up the new checklist instead of stale items.
delete from checklist_items;

insert into checklist_items (patient_id, category, item_key, item_label, sort_order)
select p.id, c.category::checklist_category, c.item_key, c.item_label, c.sort_order
from patients p
cross join (values
  ('admin', 'appointment_booked', 'Appointment date & time booked', 1),
  ('admin', 'sms_confirmation_sent', 'Text confirmation sent to patient', 2),
  ('admin', 'patient_confirmed', 'Patient confirmed yes/no', 3),
  ('admin', 'added_to_diary', 'Added to diary', 4),
  ('admin', 'surgery_date_recorded', 'Surgery date recorded', 5),
  ('admin', 'jotform_sent', 'Jotform sent to patient', 6),
  ('admin', 'jotform_completed', 'Jotform completed by patient', 7),
  ('admin', 'preop_letter_sent', 'Pre-op letter sent', 8),
  ('admin', 'preop_invoice_sent', 'Pre-op invoice sent', 9),
  ('admin', 'seen_by_np', 'Seen by nurse practitioner', 10),
  ('admin', 'postop_call_scheduled', 'Post-op call date scheduled', 11),
  ('admin', 'postop_call_completed', 'Post-op call completed', 12),
  ('admin', 'postop_letter_sent', 'Post-op letter sent', 13),
  ('admin', 'postop_invoice_sent', 'Post-op invoice sent', 14),
  ('clinical', 'preop_evaluation_completed', 'Pre-op evaluation completed', 1),
  ('clinical', 'bloods_ordered', 'Bloods ordered', 2),
  ('clinical', 'bloods_reviewed', 'Bloods results reviewed', 3),
  ('clinical', 'clearance_confirmed', 'Clearance to proceed confirmed', 4),
  ('clinical', 'clearance_letter_sent', 'Clearance letter sent to surgeon', 5),
  ('clinical', 'inhospital_preop_review', 'In-hospital pre-op review done', 6),
  ('clinical', 'surgery_completed', 'Surgery completed', 7),
  ('clinical', 'postop_medical_review', 'Post-op medical review done', 8),
  ('clinical', 'day4_call', 'Day 4 phone call completed', 9),
  ('clinical', 'loop_closed', 'Loop closed', 10)
) as c(category, item_key, item_label, sort_order);
