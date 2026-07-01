"use client";

import { useState, useTransition } from "react";
import { updatePatient } from "@/app/actions/patients";
import { Pencil, X, Save, ChevronDown, ChevronUp } from "lucide-react";

type Patient = Record<string, string | boolean | null | undefined>;

// ── helpers ──────────────────────────────────────────────────────────────────

function val(p: Patient, k: string): string {
  const v = p[k];
  if (v === null || v === undefined || v === false) return "";
  return String(v);
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</span>
      <span className="text-sm text-slate-700">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-2 text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 mb-3"
    >
      {title}
      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  );
}

// ── Edit field components ─────────────────────────────────────────────────────

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="border border-gray-200 rounded px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-teal/50 bg-white"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue || ""}
        className="border border-gray-200 rounded px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-teal/50 bg-white"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Mx", "Dr", "Prof", "Rev", "Hon", "Adm", "Capt", "Cpl", "Sgt", "Other"];
const GENDERS = ["Man", "Woman", "Non-binary", "Gender diverse", "Transgender man", "Transgender woman", "Prefer not to say", "Other"];
const SEX_AT_BIRTH = ["Male", "Female", "Intersex", "Prefer not to say", "Unknown"];
const PRONOUNS = ["He/Him", "She/Her", "They/Them", "Ze/Zir", "Prefer not to say", "Other"];
const SEXUAL_ORIENTATIONS = ["Heterosexual/Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Asexual", "Queer", "Prefer not to say", "Other"];
const INDIGENOUS_STATUSES = [
  "Aboriginal but not Torres Strait Islander",
  "Torres Strait Islander but not Aboriginal",
  "Both Aboriginal and Torres Strait Islander",
  "Neither",
  "Prefer not to say",
];
const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
const DVA_COLOURS = ["Gold", "White", "Orange"];
const CONCESSION_TYPES = ["Pensioner", "Healthcare Card", "Commonwealth Seniors", "Other"];

const toOpts = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

// ── View mode ─────────────────────────────────────────────────────────────────

function ViewMode({ patient }: { patient: Patient }) {
  const [sections, setSections] = useState({
    personal: true,
    contact: true,
    address: false,
    medicare: true,
    nok: true,
    clinical: true,
    identity: false,
  });

  const toggle = (k: keyof typeof sections) =>
    setSections((s) => ({ ...s, [k]: !s[k] }));

  const address = [
    val(patient, "address_line1"),
    val(patient, "address_suburb"),
    val(patient, "address_state"),
    val(patient, "address_postcode"),
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-1">
      {/* Personal */}
      <SectionHeader title="Personal" open={sections.personal} onToggle={() => toggle("personal")} />
      {sections.personal && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Full name" value={val(patient, "full_name")} />
          <Row label="Preferred name" value={val(patient, "preferred_name")} />
          <Row label="Title" value={val(patient, "title")} />
          <Row label="Date of birth" value={val(patient, "date_of_birth")} />
          <Row label="UR number" value={val(patient, "ur_number")} />
          <Row label="Occupation" value={val(patient, "occupation")} />
          <Row label="Country of birth" value={val(patient, "country_of_birth")} />
          <Row label="Language" value={val(patient, "language")} />
          <Row label="Interpreter" value={patient.interpreter_required ? "Required" : undefined} />
        </div>
      )}

      {/* Contact */}
      <SectionHeader title="Contact" open={sections.contact} onToggle={() => toggle("contact")} />
      {sections.contact && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Mobile" value={val(patient, "mobile")} />
          <Row label="Home phone" value={val(patient, "home_phone")} />
          <Row label="Work phone" value={val(patient, "work_phone")} />
          <Row label="Email" value={val(patient, "email")} />
          <Row label="Fax" value={val(patient, "fax")} />
          <Row label="Preferred contact" value={val(patient, "preferred_contact")} />
        </div>
      )}

      {/* Address */}
      <SectionHeader title="Address" open={sections.address} onToggle={() => toggle("address")} />
      {sections.address && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Street" value={val(patient, "address_line1")} />
          <Row label="Suburb" value={val(patient, "address_suburb")} />
          <Row label="State" value={val(patient, "address_state")} />
          <Row label="Postcode" value={val(patient, "address_postcode")} />
          <Row label="Country" value={val(patient, "address_country")} />
          {address && <div className="col-span-full text-xs text-gray-400 italic">{address}</div>}
        </div>
      )}

      {/* Medicare & Insurance */}
      <SectionHeader title="Medicare & Insurance" open={sections.medicare} onToggle={() => toggle("medicare")} />
      {sections.medicare && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Medicare number" value={val(patient, "medicare_number")} />
          <Row label="IRN" value={val(patient, "medicare_irn")} />
          <Row label="Medicare expiry" value={val(patient, "medicare_expiry")} />
          <Row label="DVA number" value={val(patient, "dva_number")} />
          <Row label="DVA card colour" value={val(patient, "dva_card_colour")} />
          <Row label="Health fund" value={val(patient, "health_fund")} />
          <Row label="Fund number" value={val(patient, "health_fund_number")} />
          <Row label="Fund expiry" value={val(patient, "health_fund_expiry")} />
          <Row label="Concession type" value={val(patient, "concession_type")} />
          <Row label="Concession number" value={val(patient, "concession_number")} />
        </div>
      )}

      {/* NOK */}
      <SectionHeader title="Next of kin" open={sections.nok} onToggle={() => toggle("nok")} />
      {sections.nok && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Name" value={val(patient, "nok_name")} />
          <Row label="Relationship" value={val(patient, "nok_relationship")} />
          <Row label="Phone" value={val(patient, "nok_phone")} />
          <Row label="Email" value={val(patient, "nok_email")} />
        </div>
      )}

      {/* Clinical */}
      <SectionHeader title="Clinical" open={sections.clinical} onToggle={() => toggle("clinical")} />
      {sections.clinical && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Referring surgeon" value={val(patient, "referring_surgeon")} />
          <Row label="Planned surgery" value={val(patient, "planned_surgery")} />
          <Row label="Surgery date" value={val(patient, "surgery_date")} />
          <Row label="Hospital" value={val(patient, "hospital")} />
        </div>
      )}

      {/* Identity */}
      <SectionHeader title="Identity" open={sections.identity} onToggle={() => toggle("identity")} />
      {sections.identity && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mb-4">
          <Row label="Gender identity" value={val(patient, "gender")} />
          <Row label="Sex at birth" value={val(patient, "sex_at_birth")} />
          <Row label="Pronouns" value={val(patient, "pronouns")} />
          <Row label="Sexual orientation" value={val(patient, "sexual_orientation")} />
          <Row label="Indigenous status" value={val(patient, "indigenous_status")} />
        </div>
      )}
    </div>
  );
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

function EditMode({ patient, onCancel }: { patient: Patient; onCancel: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await updatePatient(String(patient.id), fd);
        onCancel();
      } catch (err: any) {
        setError(err.message || "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="text-red-500 text-sm bg-red-50 rounded px-3 py-2">{error}</div>}

      {/* Personal */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Personal</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SelectField label="Title" name="title" options={toOpts(TITLES)} defaultValue={val(patient, "title")} />
          <Field label="First name" name="first_name" defaultValue={val(patient, "first_name")} required />
          <Field label="Middle name" name="middle_name" defaultValue={val(patient, "middle_name")} />
          <Field label="Last name" name="last_name" defaultValue={val(patient, "last_name")} />
          <Field label="Preferred name" name="preferred_name" defaultValue={val(patient, "preferred_name")} />
          <Field label="Date of birth" name="date_of_birth" type="date" defaultValue={val(patient, "date_of_birth")} required />
          <Field label="Occupation" name="occupation" defaultValue={val(patient, "occupation")} />
          <Field label="Country of birth" name="country_of_birth" defaultValue={val(patient, "country_of_birth")} />
          <Field label="Language" name="language" defaultValue={val(patient, "language")} />
          <SelectField label="Interpreter required" name="interpreter_required" options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} defaultValue={patient.interpreter_required ? "true" : "false"} />
        </div>
      </div>

      {/* Contact */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Contact</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Mobile" name="mobile" type="tel" defaultValue={val(patient, "mobile")} />
          <Field label="Home phone" name="home_phone" type="tel" defaultValue={val(patient, "home_phone")} />
          <Field label="Work phone" name="work_phone" type="tel" defaultValue={val(patient, "work_phone")} />
          <Field label="Email" name="email" type="email" defaultValue={val(patient, "email")} />
          <Field label="Fax" name="fax" defaultValue={val(patient, "fax")} />
          <SelectField label="Preferred contact" name="preferred_contact" options={toOpts(["mobile", "home_phone", "work_phone", "email"])} defaultValue={val(patient, "preferred_contact")} />
        </div>
      </div>

      {/* Address */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Address</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-3">
            <Field label="Street address" name="address_line1" defaultValue={val(patient, "address_line1")} />
          </div>
          <Field label="Suburb" name="address_suburb" defaultValue={val(patient, "address_suburb")} />
          <SelectField label="State" name="address_state" options={toOpts(STATES)} defaultValue={val(patient, "address_state")} />
          <Field label="Postcode" name="address_postcode" defaultValue={val(patient, "address_postcode")} />
          <Field label="Country" name="address_country" defaultValue={val(patient, "address_country") || "Australia"} />
        </div>
      </div>

      {/* Medicare & Insurance */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Medicare & Insurance</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Medicare number" name="medicare_number" defaultValue={val(patient, "medicare_number")} />
          <Field label="IRN" name="medicare_irn" defaultValue={val(patient, "medicare_irn")} />
          <Field label="Medicare expiry (MM/YY)" name="medicare_expiry" defaultValue={val(patient, "medicare_expiry")} />
          <Field label="DVA number" name="dva_number" defaultValue={val(patient, "dva_number")} />
          <SelectField label="DVA card colour" name="dva_card_colour" options={toOpts(DVA_COLOURS)} defaultValue={val(patient, "dva_card_colour")} />
          <Field label="Health fund" name="health_fund" defaultValue={val(patient, "health_fund")} />
          <Field label="Fund number" name="health_fund_number" defaultValue={val(patient, "health_fund_number")} />
          <Field label="Fund expiry (MM/YY)" name="health_fund_expiry" defaultValue={val(patient, "health_fund_expiry")} />
          <SelectField label="Concession type" name="concession_type" options={toOpts(CONCESSION_TYPES)} defaultValue={val(patient, "concession_type")} />
          <Field label="Concession number" name="concession_number" defaultValue={val(patient, "concession_number")} />
        </div>
      </div>

      {/* NOK */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Next of kin</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Name" name="nok_name" defaultValue={val(patient, "nok_name")} />
          <Field label="Relationship" name="nok_relationship" defaultValue={val(patient, "nok_relationship")} />
          <Field label="Phone" name="nok_phone" type="tel" defaultValue={val(patient, "nok_phone")} />
          <Field label="Email" name="nok_email" type="email" defaultValue={val(patient, "nok_email")} />
        </div>
      </div>

      {/* Clinical */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Clinical</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Referring surgeon" name="referring_surgeon" defaultValue={val(patient, "referring_surgeon")} />
          <Field label="Planned surgery" name="planned_surgery" defaultValue={val(patient, "planned_surgery")} />
          <Field label="Surgery date" name="surgery_date" type="date" defaultValue={val(patient, "surgery_date")} />
          <Field label="Hospital" name="hospital" defaultValue={val(patient, "hospital")} />
        </div>
      </div>

      {/* Identity */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal border-b border-gray-100 pb-2 mb-3">Identity</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SelectField label="Gender identity" name="gender" options={toOpts(GENDERS)} defaultValue={val(patient, "gender")} />
          <SelectField label="Sex at birth" name="sex_at_birth" options={toOpts(SEX_AT_BIRTH)} defaultValue={val(patient, "sex_at_birth")} />
          <SelectField label="Pronouns" name="pronouns" options={toOpts(PRONOUNS)} defaultValue={val(patient, "pronouns")} />
          <SelectField label="Sexual orientation" name="sexual_orientation" options={toOpts(SEXUAL_ORIENTATIONS)} defaultValue={val(patient, "sexual_orientation")} />
          <SelectField label="Indigenous status" name="indigenous_status" options={toOpts(INDIGENOUS_STATUSES)} defaultValue={val(patient, "indigenous_status")} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:bg-brand-teal/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-md border border-gray-200 text-slate-600 text-sm px-4 py-2 hover:bg-gray-50"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PatientProfilePanel({ patient }: { patient: Patient }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-slate-700">Patient details</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-brand-teal/80 border border-brand-teal/30 rounded px-2.5 py-1.5 hover:bg-brand-teal/5"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <EditMode patient={patient} onCancel={() => setEditing(false)} />
      ) : (
        <ViewMode patient={patient} />
      )}
    </div>
  );
}
