# Perioperative Australia — Unified Platform Architecture Proposal

**Prepared for:** Dr Sahil Vohra, Perioperative Australia  
**Date:** 30 June 2026  
**Status:** Draft for discussion

---

## Vision

A single web platform that replaces the four disconnected tools currently in use:

| Tool | Purpose | Replace with |
|------|---------|--------------|
| Gentu (medical PMS) | Patient records, appointments, billing | Native patient module |
| i-scribe | Consultation dictation + letter generation | Built-in dictation + AI letters (already started) |
| Coviu | Telehealth video | Embedded video consult (Daily.co or Whereby API) |
| Xero | Practice accounting | Xero API integration or native MBS billing |

The platform will be built on the existing **Perioperative Journey Tracker** codebase (Next.js 16 + Supabase), extending it progressively. No big-bang rewrite.

---

## Data Model

### Core tables (Supabase / PostgreSQL)

```
patients
  id, ur_number, full_name, date_of_birth, medicare_number
  referring_surgeon, referring_gp, planned_surgery, surgery_date, hospital
  bloods_status, created_at, updated_at

appointments
  id, patient_id, provider_id, start_at, end_at, type (consult/follow_up/telehealth)
  status (scheduled/confirmed/arrived/completed/cancelled/dna)
  coviu_room_url, notes, created_at

encounters
  id, patient_id, appointment_id, provider_id
  raw_transcript, cleaned_transcript, encounter_date
  subjective, objective, assessment, plan (SOAP — AI extracted)
  created_at

letters
  id, patient_id, encounter_id (nullable), letter_code
  letter_type (preop_assessment/gp/referral/pharmacist/patient_instructions/mbs_132/ward_round)
  procedure_type, status (draft/reviewed/sent), docx_path
  sent_at, recipient_name, recipient_address
  notes, created_by, created_at

diagnoses
  id, patient_id, snomed_code, description, onset_date, status (active/resolved)
  source (ai_extracted/manual), verified_by, created_at

medications
  id, patient_id, drug_name, dose, frequency, route, indication
  status (current/ceased/on_hold), source (ai_extracted/manual)
  verified_by, last_verified_at, created_at

investigations
  id, patient_id, type (bloods/ecg/imaging/pft), ordered_at, received_at
  result_summary, result_file_path, ordered_by, created_at

mbs_items
  id, patient_id, encounter_id, item_number, description
  date_of_service, fee_charged, gap_amount, status (pending/billed/paid/rejected)
  xero_invoice_id, created_at

profiles (already exists)
  id, role (admin/doctor/staff), full_name, provider_number, ahpra_number

checklist_items (already exists)
clinical_notes (already exists)
```

### Key design decisions
- `encounters` decouples the clinical visit from both the appointment (scheduling) and letters (output). One encounter can produce multiple letters.
- `diagnoses` and `medications` are stored separately from letter text — they are the structured ground truth that letters are generated from. This prevents fabrication and enables future e-prescribing.
- All AI-extracted clinical data is flagged `source = 'ai_extracted'` and requires a `verified_by` provider before being used in billing or referrals.

---

## Navigation / Information Architecture

```
Sidebar (icon-only, brand-navy)
├── Dashboard          — upcoming appointments, pending bloods, unreviewed letters
├── Patients           — registry, search, new patient
│   └── [Patient]
│       ├── Letters    (default tab — existing, expand with encounter linking)
│       ├── Clinical   — diagnoses, medications, investigations (Gentu-style right panel)
│       ├── Encounters — visit history with transcript + SOAP
│       ├── Appointments
│       └── Billing    — MBS items, invoices
├── Appointments       — day/week calendar view
├── Periop Intake      — quick letter generation (existing)
├── Video (Telehealth) — launch Coviu room, join waiting room
├── Templates          — letter templates, checklist templates
└── Admin              — user management, practice settings, Xero sync
```

---

## Integration Approach

### Coviu (video consult)
- **API:** Coviu REST API — create a room per appointment, embed the room URL in the appointments record.
- **Flow:** Provider clicks "Start video" on appointment → POST /api/coviu/room → returns join URL → opens in new tab (or iframe within the platform).
- **AI capture:** Coviu supports webhook on session end with recording URL. Feed recording → Azure Speech transcription → creates/updates encounter transcript automatically.
- **Effort:** ~1 week (API wrapper + UI button + webhook handler)

### Xero (billing)
- **Approach:** Xero OAuth2 integration. When a provider marks an MBS item as billed, the platform creates an invoice in Xero via Xero API and stores the `xero_invoice_id`.
- **Reconciliation:** Daily sync job (Supabase Edge Function on cron) pulls invoice payment status from Xero → updates `mbs_items.status`.
- **MBS item 132:** Already in command engine for letter generation. Extend to also create the corresponding `mbs_items` record and trigger Xero invoice.
- **Effort:** ~2–3 weeks (OAuth flow + invoice creation + sync job)

### Azure OpenAI (already integrated)
- Extend to SOAP note extraction per encounter (structured JSON from encounter transcript).
- Extract diagnoses and medications from encounter → insert into `diagnoses`/`medications` tables (pending provider verification).

### Azure Speech (already integrated)
- Already used for dictation transcription.
- Extend: real-time streaming transcription option (WebSocket to Azure Speech SDK) for live consult mode.

### E-prescribing
- **Short term:** Generate a medication list section in letters (already done via letter template).
- **Medium term:** Integrate with Fred Dispense or MediRecords eRx API for electronic prescriptions.
- **Not in scope for first 6 months.**

---

## Phased Build Order

### Phase 1 — Clinical Record (current + 4–6 weeks)
Already done:
- Patient registry, UR numbers, bloods status
- Letters tab: dictation, OCR, AI letter generation, verification, docx export
- Dashboard: upcoming surgeries, pending bloods

Next:
1. **Encounters module** — link letters to encounters, store SOAP notes
2. **Diagnoses + Medications panels** — display in patient detail (right-side Gentu-style panel), AI-extracted from OCR/transcript, verify-before-use gate
3. **Investigations** — attach blood results, ECG, imaging to patient record

### Phase 2 — Appointments (6–10 weeks)
4. **Appointment calendar** — day/week view, create/edit/cancel, appointment types
5. **Arrival/waiting room flow** — check-in, appointment status updates
6. **Telehealth integration** — Coviu room creation, join button, post-session transcript webhook

### Phase 3 — Billing (10–16 weeks)
7. **MBS item capture** — tag MBS items per encounter (132, 585, etc.)
8. **Xero OAuth + invoice creation** — automated billing on MBS item finalization
9. **Payment reconciliation** — Xero sync, gap payment tracking
10. **Billing dashboard** — revenue, outstanding invoices, item utilization

### Phase 4 — Practice operations (16–24 weeks)
11. **Multi-provider scheduling** — provider calendars, room/resource allocation
12. **Referral management** — inbound referral queue, triage, assign to provider
13. **Patient portal** — patient-facing appointment booking, pre-admission forms
14. **Reporting** — clinical KPIs, billing summaries, MBS utilization

---

## Technical Architecture

```
Next.js 16 (App Router)
├── Server components — data fetching, auth (Supabase SSR)
├── Server actions — mutations (letters, checklist, notes, appointments)
├── API routes — AI pipelines (generate, transcribe, extract), webhooks (Coviu, Xero)
└── Client components — interactive UI (LettersPanel, Calendar, VideoRoom)

Supabase
├── PostgreSQL — all structured data + RLS
├── Storage — patient-letters bucket (docx files), investigation attachments
├── Auth — cookie-based sessions, role-based (admin/doctor/staff)
└── Edge Functions — scheduled Xero sync, appointment reminders (SMS via Twilio)

Azure (already provisioned)
├── Document Intelligence — OCR on referral letters, investigation reports
├── OpenAI (gpt-4.1-mini-2) — letter generation, SOAP extraction, verification pass
└── Speech (australiaeast) — dictation transcription, future real-time streaming

Third-party integrations
├── Coviu — video consult rooms + session webhooks
├── Xero — accounting + invoice creation
└── eRx / Fred (future) — electronic prescriptions
```

### Security & compliance
- **De-identification for AI:** Patient names, DOBs, Medicare numbers are stripped before any AI API call (already implemented via `redactIdentifiers()`). AI output uses "[Patient]" placeholders.
- **Audit trail:** All letter saves, status changes, and clinical data modifications are timestamped with `created_by` / `updated_by`.
- **RLS everywhere:** All Supabase tables have row-level security; no service role key exposed client-side.
- **Storage signed URLs:** Docx files served via 5-minute signed URLs only (never public).
- **Future:** HIPAA/Privacy Act alignment review before billing/Xero integration (patient financial data).

---

## Decisions (30 June 2026)

1. **Tenancy:** Single-practice internal tool for now. Multi-tenancy deferred.
2. **Video:** Deferred — not a priority until clinical record and messaging are solid.
3. **Billing:** No Xero integration. Skip for now; build in-house module when needed.
4. **Patient portal:** Not in scope. Internal provider tool only.
5. **Provider credentials:** Dr Vohra only for now. Add others when multi-provider scheduling is built.
6. **SMS/email reminders:** Deferred until appointments module is live.

---

## Summary

The existing Journey Tracker is already Phase 1-complete for letters and clinical tracking. The fastest path to a Gentu-equivalent is:

- **Now:** Encounters + Diagnoses/Medications panels (4–6 weeks)
- **Q3 2026:** Appointments calendar + Coviu video (6–10 weeks)
- **Q4 2026:** Xero billing (10–16 weeks)
- **2027:** Patient portal + multi-provider operations

The platform vision is viable. The foundation (Next.js + Supabase + Azure AI) is already production-grade. The main risk is scope creep — keep each phase shippable before starting the next.

---

## Revised Build Order (agreed 30 June 2026)

| Priority | Feature | Notes |
|----------|---------|-------|
| ✅ Done | Letters generation, OCR, dictation, docx export | Live on localhost:3001 |
| **Next** | HealthLink + Medical Objects integration | Send letters electronically to GPs/specialists |
| 3 | Encounters module | Link letters to clinical visits, SOAP notes |
| 4 | Diagnoses + Medications panels | Structured clinical record (Gentu-style) |
| 5 | Appointments calendar | Day/week view, appointment types |
| Later | In-house billing module | MBS item capture, invoicing (no Xero) |
| Later | Video (Coviu or similar) | Telehealth when appointments are solid |
