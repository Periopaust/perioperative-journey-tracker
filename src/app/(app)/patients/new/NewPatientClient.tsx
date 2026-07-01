"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Link2, PenLine, Sparkles, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type PatientForm = {
  // Name
  title: string; first_name: string; middle_name: string; last_name: string; preferred_name: string;
  // Core
  date_of_birth: string; ur_number: string;
  // Identity
  gender: string; sex_at_birth: string; pronouns: string; sexual_orientation: string; indigenous_status: string;
  // Contact
  mobile: string; home_phone: string; work_phone: string; email: string; fax: string; preferred_contact: string;
  // Address
  address_line1: string; address_suburb: string; address_state: string; address_postcode: string; address_country: string;
  // Medicare & Insurance
  medicare_number: string; medicare_irn: string; medicare_expiry: string;
  dva_number: string; dva_card_colour: string;
  health_fund: string; health_fund_number: string; health_fund_expiry: string;
  concession_type: string; concession_number: string;
  // NOK / Emergency
  nok_name: string; nok_relationship: string; nok_phone: string; nok_email: string;
  // Additional
  occupation: string; country_of_birth: string; language: string;
  interpreter_required: string;
  // Clinical
  referring_surgeon: string; planned_surgery: string; surgery_date: string; hospital: string;
};

const EMPTY: PatientForm = {
  title:"", first_name:"", middle_name:"", last_name:"", preferred_name:"",
  date_of_birth:"", ur_number:"",
  gender:"", sex_at_birth:"", pronouns:"", sexual_orientation:"", indigenous_status:"",
  mobile:"", home_phone:"", work_phone:"", email:"", fax:"", preferred_contact:"mobile",
  address_line1:"", address_suburb:"", address_state:"", address_postcode:"", address_country:"Australia",
  medicare_number:"", medicare_irn:"", medicare_expiry:"",
  dva_number:"", dva_card_colour:"",
  health_fund:"", health_fund_number:"", health_fund_expiry:"",
  concession_type:"", concession_number:"",
  nok_name:"", nok_relationship:"", nok_phone:"", nok_email:"",
  occupation:"", country_of_birth:"", language:"", interpreter_required:"false",
  referring_surgeon:"", planned_surgery:"", surgery_date:"", hospital:"",
};

type Mode = "choose" | "referral" | "healthlink" | "manual";

const AU_STATES = ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"];

const TITLES = ["Mr","Mrs","Ms","Miss","Mx","Dr","Prof","Rev","Hon","Adm","Capt","Cpl","Sgt","Other"];

const GENDERS = [
  "Man", "Woman", "Non-binary", "Gender diverse",
  "Transgender man", "Transgender woman", "Prefer not to say", "Other",
];

const SEX_AT_BIRTH = ["Male","Female","Intersex","Prefer not to say","Unknown"];

const PRONOUNS = ["He/Him","She/Her","They/Them","Ze/Zir","Prefer not to say","Other"];

const SEXUAL_ORIENTATIONS = [
  "Heterosexual / Straight","Gay","Lesbian","Bisexual","Pansexual",
  "Asexual","Queer","Prefer not to say","Other",
];

const INDIGENOUS_STATUSES = [
  "Aboriginal but not Torres Strait Islander",
  "Torres Strait Islander but not Aboriginal",
  "Both Aboriginal and Torres Strait Islander",
  "Neither Aboriginal nor Torres Strait Islander",
  "Prefer not to say",
];

const DVA_COLOURS = ["Gold","White","Orange"];

const CONCESSION_TYPES = ["Pension","Health Care Card","Commonwealth Seniors","DVA","Other"];

const PREFERRED_CONTACT = ["mobile","home_phone","work_phone","email","fax"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition"
      >
        <span className="font-semibold text-sm text-slate-800">{title}</span>
        {open ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}

function Field({ label, name, value, onChange, type = "text", required = false, span = 1, highlighted = false, placeholder }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; span?: number; highlighted?: boolean; placeholder?: string;
}) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : span === 3 ? "col-span-full" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        name={name} type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal transition ${
          highlighted ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-white"
        }`}
      />
    </div>
  );
}

function Select({ label, name, value, onChange, options, required = false, highlighted = false }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  options: string[]; required?: boolean; highlighted?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <select
        name={name} value={value} onChange={e => onChange(e.target.value)}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal transition ${
          highlighted ? "border-emerald-400 bg-emerald-50" : "border-gray-300 bg-white"
        }`}
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NewPatientClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [form, setForm] = useState<PatientForm>(EMPTY);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Referral
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracted, setExtracted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(key: keyof PatientForm, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function h(key: string) { return highlighted.has(key); }

  // ── Extraction ──────────────────────────────────────────────────────────────

  async function handleExtract() {
    if (files.length === 0 && !pastedText.trim()) {
      setExtractError("Please upload a document or paste referral text.");
      return;
    }
    setExtracting(true);
    setExtractError("");
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      if (pastedText.trim()) fd.append("pastedText", pastedText);

      const res = await fetch("/api/patients/extract-referral", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const e = data.extracted;
      const hl = new Set<string>();

      // Map extracted fields to form
      const updates: Partial<PatientForm> = {};
      function pick(formKey: keyof PatientForm, val: string | null) {
        if (val) { updates[formKey] = val; hl.add(formKey); }
      }

      // Name parsing
      if (e.full_name) {
        const parts = (e.full_name as string).trim().split(/\s+/);
        if (parts.length >= 2) {
          updates.first_name = parts[0]; hl.add("first_name");
          updates.last_name = parts[parts.length - 1]; hl.add("last_name");
          if (parts.length > 2) { updates.middle_name = parts.slice(1, -1).join(" "); hl.add("middle_name"); }
        } else {
          updates.first_name = e.full_name; hl.add("first_name");
        }
      }

      pick("date_of_birth", e.date_of_birth);
      pick("ur_number", e.ur_number);
      pick("referring_surgeon", e.referring_surgeon);
      pick("planned_surgery", e.planned_surgery);
      pick("surgery_date", e.surgery_date);
      pick("hospital", e.hospital);
      pick("medicare_number", e.medicare_number);
      pick("mobile", e.phone);
      pick("address_line1", e.address);
      pick("email", e.email);
      pick("fax", e.fax);
      pick("health_fund", e.health_fund);
      pick("occupation", e.occupation);
      pick("country_of_birth", e.country_of_birth);
      pick("nok_name", e.nok_name);
      pick("nok_relationship", e.nok_relationship);
      pick("nok_phone", e.nok_phone);

      setForm(f => ({ ...f, ...updates }));
      setHighlighted(hl);
      setExtracted(true);
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ")
      || form.first_name;
    if (!fullName.trim() || !form.date_of_birth) {
      setSubmitError("First name, last name and date of birth are required.");
      return;
    }
    if (!form.mobile && !form.home_phone && !form.work_phone && !form.email && !form.fax) {
      setSubmitError("At least one contact method is required (mobile, phone, or email).");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("full_name", [form.title, form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" "));
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.set("interpreter_required", form.interpreter_required === "true" ? "true" : "false");

      const res = await fetch("/api/patients/create", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create patient");
      router.push(`/patients/${data.id}`);
    } catch (err: any) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  // ── Mode: Choose ─────────────────────────────────────────────────────────────

  if (mode === "choose") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mb-6">New patient</h1>
        <div className="grid grid-cols-1 gap-3">
          <button type="button" onClick={() => setMode("referral")}
            className="flex items-start gap-4 bg-white border-2 border-brand-teal rounded-xl p-5 text-left hover:bg-brand-teal/5 transition group">
            <div className="w-10 h-10 rounded-lg bg-brand-teal/10 flex items-center justify-center shrink-0">
              <Sparkles size={20} className="text-brand-teal"/>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Extract from referral</p>
              <p className="text-sm text-gray-500 mt-0.5">Upload a PDF or fax — AI fills in as much as possible, you complete the rest</p>
            </div>
          </button>

          <button type="button" disabled
            className="flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 text-left opacity-50 cursor-not-allowed">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Link2 size={20} className="text-gray-400"/>
            </div>
            <div>
              <p className="font-semibold text-slate-600">HealthLink / Medical Objects <span className="text-xs font-normal text-gray-400 ml-1">Coming soon</span></p>
              <p className="text-sm text-gray-400 mt-0.5">Import directly from secure messaging</p>
            </div>
          </button>

          <button type="button" onClick={() => setMode("manual")}
            className="flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 text-left hover:bg-gray-50 transition">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <PenLine size={20} className="text-gray-500"/>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Enter manually</p>
              <p className="text-sm text-gray-500 mt-0.5">Fill in the registration form directly</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Referral upload ──────────────────────────────────────────────────────────

  const referralUploader = (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-teal hover:bg-brand-teal/5 transition"
      >
        <Upload size={28} className="text-gray-400 mx-auto mb-2"/>
        <p className="text-sm font-medium text-slate-700">Drop referral here or click to upload</p>
        <p className="text-xs text-gray-400 mt-1">PDF, image (JPG, PNG), Word document</p>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tiff,.heic,.docx,.doc"
          className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))}/>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
              <FileText size={13} className="text-brand-teal"/> {f.name}
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200"/></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or paste referral text</span></div>
      </div>

      <textarea value={pastedText} onChange={e => setPastedText(e.target.value)} rows={4}
        placeholder="Paste the referral letter text here..."
        className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"/>

      {extractError && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          <AlertCircle size={14}/> {extractError}
        </div>
      )}

      <button type="button" onClick={handleExtract}
        disabled={extracting || (files.length === 0 && !pastedText.trim())}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition">
        <Sparkles size={15}/>
        {extracting ? "Reading referral..." : "Extract patient details"}
      </button>
    </div>
  );

  // ── Full registration form ───────────────────────────────────────────────────

  const registrationForm = (
    <form onSubmit={handleSubmit} className="space-y-3">
      {extracted && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 size={15}/> Details extracted from referral — highlighted fields were auto-filled. Please review and complete before saving.
        </div>
      )}

      {/* 1. Patient details */}
      <Section title="Patient details" defaultOpen>
        <Row>
          <Select label="Title / Salutation" name="title" value={form.title} onChange={v => set("title",v)}
            options={TITLES} highlighted={h("title")}/>
          <Field label="First name" name="first_name" value={form.first_name} onChange={v => set("first_name",v)}
            required highlighted={h("first_name")}/>
          <Field label="Middle name" name="middle_name" value={form.middle_name} onChange={v => set("middle_name",v)}
            highlighted={h("middle_name")}/>
          <Field label="Last name" name="last_name" value={form.last_name} onChange={v => set("last_name",v)}
            required highlighted={h("last_name")}/>
          <Field label="Preferred name" name="preferred_name" value={form.preferred_name} onChange={v => set("preferred_name",v)}
            placeholder="Goes by..." highlighted={h("preferred_name")}/>
          <Field label="Date of birth" name="date_of_birth" value={form.date_of_birth} onChange={v => set("date_of_birth",v)}
            type="date" required highlighted={h("date_of_birth")}/>
          <Field label="UR number" name="ur_number" value={form.ur_number} onChange={v => set("ur_number",v)}
            highlighted={h("ur_number")}/>
          <Field label="Occupation" name="occupation" value={form.occupation} onChange={v => set("occupation",v)}
            highlighted={h("occupation")}/>
          <Field label="Country of birth" name="country_of_birth" value={form.country_of_birth} onChange={v => set("country_of_birth",v)}
            highlighted={h("country_of_birth")}/>
          <Field label="Language spoken at home" name="language" value={form.language} onChange={v => set("language",v)}
            highlighted={h("language")}/>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interpreter required</label>
            <select value={form.interpreter_required} onChange={e => set("interpreter_required", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </Row>
      </Section>

      {/* 2. Gender identity & sexual orientation */}
      <Section title="Gender identity & cultural safety">
        <p className="text-xs text-gray-500 -mt-1 mb-2">All fields are optional. This information helps us provide safe, inclusive, and culturally appropriate care.</p>
        <Row>
          <Select label="Gender" name="gender" value={form.gender} onChange={v => set("gender",v)}
            options={GENDERS} highlighted={h("gender")}/>
          <Select label="Sex recorded at birth" name="sex_at_birth" value={form.sex_at_birth} onChange={v => set("sex_at_birth",v)}
            options={SEX_AT_BIRTH} highlighted={h("sex_at_birth")}/>
          <Select label="Pronouns" name="pronouns" value={form.pronouns} onChange={v => set("pronouns",v)}
            options={PRONOUNS} highlighted={h("pronouns")}/>
          <Select label="Sexual orientation" name="sexual_orientation" value={form.sexual_orientation} onChange={v => set("sexual_orientation",v)}
            options={SEXUAL_ORIENTATIONS} highlighted={h("sexual_orientation")}/>
        </Row>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-600 mb-2">Aboriginal and/or Torres Strait Islander status</label>
          <div className="space-y-1.5">
            {INDIGENOUS_STATUSES.map(s => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="indigenous_status" value={s}
                  checked={form.indigenous_status === s}
                  onChange={() => set("indigenous_status", s)}
                  className="accent-brand-teal"/>
                {s}
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* 3. Contact */}
      <Section title="Contact details" defaultOpen>
        <div className="mb-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Preferred contact method <span className="text-rose-500">*</span></label>
          <div className="flex flex-wrap gap-3">
            {PREFERRED_CONTACT.map(c => (
              <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="preferred_contact" value={c}
                  checked={form.preferred_contact === c}
                  onChange={() => set("preferred_contact", c)}
                  className="accent-brand-teal"/>
                {c.replace("_"," ").replace(/\b\w/g, l => l.toUpperCase())}
              </label>
            ))}
          </div>
        </div>
        <Row>
          <Field label="Mobile" name="mobile" value={form.mobile} onChange={v => set("mobile",v)}
            type="tel" highlighted={h("mobile")}/>
          <Field label="Home phone" name="home_phone" value={form.home_phone} onChange={v => set("home_phone",v)}
            type="tel" highlighted={h("home_phone")}/>
          <Field label="Work phone" name="work_phone" value={form.work_phone} onChange={v => set("work_phone",v)}
            type="tel" highlighted={h("work_phone")}/>
          <Field label="Email" name="email" value={form.email} onChange={v => set("email",v)}
            type="email" highlighted={h("email")}/>
          <Field label="Fax" name="fax" value={form.fax} onChange={v => set("fax",v)}
            type="tel" highlighted={h("fax")}/>
        </Row>
      </Section>

      {/* 4. Address */}
      <Section title="Address">
        <Row>
          <Field label="Street address" name="address_line1" value={form.address_line1} onChange={v => set("address_line1",v)}
            span={3} highlighted={h("address_line1")}/>
          <Field label="Suburb" name="address_suburb" value={form.address_suburb} onChange={v => set("address_suburb",v)}
            highlighted={h("address_suburb")}/>
          <Select label="State" name="address_state" value={form.address_state} onChange={v => set("address_state",v)}
            options={AU_STATES} highlighted={h("address_state")}/>
          <Field label="Postcode" name="address_postcode" value={form.address_postcode} onChange={v => set("address_postcode",v)}
            highlighted={h("address_postcode")}/>
          <Field label="Country" name="address_country" value={form.address_country} onChange={v => set("address_country",v)}
            highlighted={h("address_country")}/>
        </Row>
      </Section>

      {/* 5. Medicare & Health Insurance */}
      <Section title="Medicare & health insurance">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Medicare</p>
            <Row>
              <Field label="Medicare number" name="medicare_number" value={form.medicare_number} onChange={v => set("medicare_number",v)}
                highlighted={h("medicare_number")}/>
              <Field label="IRN (position on card)" name="medicare_irn" value={form.medicare_irn} onChange={v => set("medicare_irn",v)}
                highlighted={h("medicare_irn")}/>
              <Field label="Expiry (MM/YY)" name="medicare_expiry" value={form.medicare_expiry} onChange={v => set("medicare_expiry",v)}
                placeholder="01/28" highlighted={h("medicare_expiry")}/>
            </Row>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">DVA</p>
            <Row>
              <Field label="DVA number" name="dva_number" value={form.dva_number} onChange={v => set("dva_number",v)}
                highlighted={h("dva_number")}/>
              <Select label="DVA card colour" name="dva_card_colour" value={form.dva_card_colour} onChange={v => set("dva_card_colour",v)}
                options={DVA_COLOURS}/>
            </Row>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Private health insurance</p>
            <Row>
              <Field label="Health fund" name="health_fund" value={form.health_fund} onChange={v => set("health_fund",v)}
                highlighted={h("health_fund")}/>
              <Field label="Membership number" name="health_fund_number" value={form.health_fund_number} onChange={v => set("health_fund_number",v)}
                highlighted={h("health_fund_number")}/>
              <Field label="Expiry" name="health_fund_expiry" value={form.health_fund_expiry} onChange={v => set("health_fund_expiry",v)}
                placeholder="01/28"/>
            </Row>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Concession</p>
            <Row>
              <Select label="Concession type" name="concession_type" value={form.concession_type} onChange={v => set("concession_type",v)}
                options={CONCESSION_TYPES}/>
              <Field label="Concession number" name="concession_number" value={form.concession_number} onChange={v => set("concession_number",v)}/>
            </Row>
          </div>
        </div>
      </Section>

      {/* 6. Next of Kin / Emergency contact */}
      <Section title="Next of kin / emergency contact">
        <Row>
          <Field label="Full name" name="nok_name" value={form.nok_name} onChange={v => set("nok_name",v)}
            highlighted={h("nok_name")}/>
          <Field label="Relationship" name="nok_relationship" value={form.nok_relationship} onChange={v => set("nok_relationship",v)}
            placeholder="e.g. Spouse, Parent, Sibling" highlighted={h("nok_relationship")}/>
          <Field label="Phone" name="nok_phone" value={form.nok_phone} onChange={v => set("nok_phone",v)}
            type="tel" highlighted={h("nok_phone")}/>
          <Field label="Email" name="nok_email" value={form.nok_email} onChange={v => set("nok_email",v)}
            type="email" highlighted={h("nok_email")}/>
        </Row>
      </Section>

      {/* 7. Clinical / referral details */}
      <Section title="Clinical details" defaultOpen>
        <Row>
          <Field label="Referring surgeon / GP" name="referring_surgeon" value={form.referring_surgeon} onChange={v => set("referring_surgeon",v)}
            highlighted={h("referring_surgeon")}/>
          <Field label="Planned surgery / procedure" name="planned_surgery" value={form.planned_surgery} onChange={v => set("planned_surgery",v)}
            highlighted={h("planned_surgery")}/>
          <Field label="Surgery date" name="surgery_date" value={form.surgery_date} onChange={v => set("surgery_date",v)}
            type="date" highlighted={h("surgery_date")}/>
          <Field label="Hospital" name="hospital" value={form.hospital} onChange={v => set("hospital",v)}
            highlighted={h("hospital")}/>
        </Row>
      </Section>

      {submitError && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <AlertCircle size={14}/> {submitError}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 pb-6">
        <button type="submit" disabled={submitting}
          className="rounded-md bg-brand-teal text-white text-sm font-medium px-6 py-2.5 hover:opacity-90 disabled:opacity-50 transition">
          {submitting ? "Creating patient..." : "Create patient"}
        </button>
        <button type="button" onClick={() => { setForm(EMPTY); setHighlighted(new Set()); setExtracted(false); }}
          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">
          Clear all
        </button>
      </div>
    </form>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => setMode("choose")}
          className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">
          {mode === "referral" ? "New patient — from referral" : "New patient"}
        </h1>
      </div>

      {mode === "referral" && !extracted && referralUploader}
      {mode === "referral" && extracted && registrationForm}
      {mode === "referral" && !extracted && (
        <p className="text-xs text-center text-gray-400 mt-3">
          Or <button type="button" onClick={() => setExtracted(true)} className="underline hover:text-gray-600">skip extraction and fill in manually</button>
        </p>
      )}
      {mode === "manual" && registrationForm}
    </div>
  );
}
