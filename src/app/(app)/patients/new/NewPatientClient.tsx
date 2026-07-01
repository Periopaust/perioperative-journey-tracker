"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Link2, PenLine, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

type Extracted = {
  full_name: string | null;
  date_of_birth: string | null;
  ur_number: string | null;
  referring_surgeon: string | null;
  referring_practice: string | null;
  referring_address: string | null;
  planned_surgery: string | null;
  surgery_date: string | null;
  hospital: string | null;
  medicare_number: string | null;
  phone: string | null;
  address: string | null;
  reason_for_referral: string | null;
};

type Mode = "choose" | "referral" | "healthlink" | "manual";

export default function NewPatientClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");

  // Referral extraction
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Patient form fields
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    ur_number: "",
    referring_surgeon: "",
    planned_surgery: "",
    surgery_date: "",
    hospital: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleExtract() {
    if (files.length === 0 && !pastedText.trim()) {
      setExtractError("Please upload a referral document or paste the referral text.");
      return;
    }
    setExtracting(true);
    setExtractError("");
    setExtracted(null);

    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (pastedText.trim()) fd.append("pastedText", pastedText);

      const res = await fetch("/api/patients/extract-referral", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const e: Extracted = data.extracted;
      setExtracted(e);

      // Pre-fill form with extracted data
      setForm({
        full_name: e.full_name || "",
        date_of_birth: e.date_of_birth || "",
        ur_number: e.ur_number || "",
        referring_surgeon: e.referring_surgeon || "",
        planned_surgery: e.planned_surgery || "",
        surgery_date: e.surgery_date || "",
        hospital: e.hospital || "",
      });
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.date_of_birth.trim()) {
      setSubmitError("Full name and date of birth are required.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));

      // Use the server action via fetch since we're in a client component
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
          <button
            type="button"
            onClick={() => setMode("referral")}
            className="flex items-start gap-4 bg-white border-2 border-brand-teal rounded-xl p-5 text-left hover:bg-brand-teal/5 transition group"
          >
            <div className="w-10 h-10 rounded-lg bg-brand-teal/10 flex items-center justify-center shrink-0 group-hover:bg-brand-teal/20 transition">
              <Sparkles size={20} className="text-brand-teal" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Extract from referral</p>
              <p className="text-sm text-gray-500 mt-0.5">Upload a PDF, fax, or paste text — AI reads the referral and fills in patient details automatically</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("healthlink")}
            className="flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 text-left hover:bg-gray-50 transition group opacity-60 cursor-not-allowed"
            disabled
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Link2 size={20} className="text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-600">HealthLink / Medical Objects <span className="text-xs font-normal text-gray-400 ml-1">Coming soon</span></p>
              <p className="text-sm text-gray-400 mt-0.5">Import directly from secure messaging — referrals arrive automatically</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("manual")}
            className="flex items-start gap-4 bg-white border border-gray-200 rounded-xl p-5 text-left hover:bg-gray-50 transition group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition">
              <PenLine size={20} className="text-gray-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Enter manually</p>
              <p className="text-sm text-gray-500 mt-0.5">Type in the patient details — only name and DOB are required to get started</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Mode: HealthLink placeholder ─────────────────────────────────────────────

  if (mode === "healthlink") {
    return (
      <div className="max-w-2xl">
        <BackButton onClick={() => setMode("choose")} />
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Link2 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">HealthLink / Medical Objects integration</p>
          <p className="text-sm text-gray-500 mt-1">This will be available in a future update.</p>
        </div>
      </div>
    );
  }

  // ── Mode: Referral extraction ─────────────────────────────────────────────────

  const patientForm = (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        {extracted ? (
          <><CheckCircle2 size={16} className="text-emerald-500"/> <span className="text-sm font-medium text-emerald-700">Details extracted — please verify before saving</span></>
        ) : (
          <span className="text-sm font-semibold text-slate-700">Patient details</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Full name *" value={form.full_name} onChange={(v) => setField("full_name", v)} highlighted={!!extracted?.full_name} />
        <FormField label="Date of birth *" value={form.date_of_birth} onChange={(v) => setField("date_of_birth", v)} type="date" highlighted={!!extracted?.date_of_birth} />
        <FormField label="UR number" value={form.ur_number} onChange={(v) => setField("ur_number", v)} highlighted={!!extracted?.ur_number} />
        <FormField label="Referring surgeon" value={form.referring_surgeon} onChange={(v) => setField("referring_surgeon", v)} highlighted={!!extracted?.referring_surgeon} />
        <FormField label="Planned surgery" value={form.planned_surgery} onChange={(v) => setField("planned_surgery", v)} highlighted={!!extracted?.planned_surgery} />
        <FormField label="Surgery date" value={form.surgery_date} onChange={(v) => setField("surgery_date", v)} type="date" highlighted={!!extracted?.surgery_date} />
        <FormField label="Hospital" value={form.hospital} onChange={(v) => setField("hospital", v)} highlighted={!!extracted?.hospital} />
      </div>

      {submitError && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          <AlertCircle size={14}/> {submitError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-teal text-white text-sm font-medium px-5 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {submitting ? "Creating..." : "Create patient"}
        </button>
        <button type="button" onClick={() => { setExtracted(null); setForm({ full_name:"",date_of_birth:"",ur_number:"",referring_surgeon:"",planned_surgery:"",surgery_date:"",hospital:"" }); }} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">
          Clear
        </button>
      </div>
    </form>
  );

  if (mode === "referral") {
    return (
      <div className="max-w-2xl space-y-4">
        <BackButton onClick={() => setMode("choose")} />
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">Extract from referral</h1>

        {!extracted && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-teal hover:bg-brand-teal/5 transition"
            >
              <Upload size={28} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Drop referral here or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">PDF, image (JPG, PNG), Word document</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.heic,.docx,.doc"
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
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

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={5}
              placeholder="Paste the referral letter text here..."
              className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
            />

            {extractError && (
              <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                <AlertCircle size={14}/> {extractError}
              </div>
            )}

            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || (files.length === 0 && !pastedText.trim())}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition"
            >
              <Sparkles size={15}/>
              {extracting ? "Reading referral..." : "Extract patient details"}
            </button>
          </div>
        )}

        {extracted && patientForm}
      </div>
    );
  }

  // ── Mode: Manual ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-4">
      <BackButton onClick={() => setMode("choose")} />
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">New patient</h1>
      {patientForm}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-1">
      ← Back
    </button>
  );
}

function FormField({ label, value, onChange, type = "text", highlighted = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; highlighted?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal transition ${
          highlighted ? "border-emerald-400 bg-emerald-50" : "border-gray-300"
        }`}
      />
    </div>
  );
}
