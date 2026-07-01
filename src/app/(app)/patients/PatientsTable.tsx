"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, User, Phone, Calendar, Building2, Droplets, ArrowRight } from "lucide-react";

type Patient = {
  id: string;
  full_name: string;
  ur_number: string;
  planned_surgery: string | null;
  surgery_date: string | null;
  hospital: string | null;
  bloods_status: string;
  created_by?: string | null;
  // demographics (may be present)
  mobile?: string | null;
  home_phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  referring_surgeon?: string | null;
  medicare_number?: string | null;
  health_fund?: string | null;
  address_suburb?: string | null;
  address_state?: string | null;
};

function bloodsBadge(status: string) {
  const map: Record<string, string> = {
    received: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ordered:  "bg-amber-50 text-amber-700 border-amber-200",
    pending:  "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-500 border-gray-200";
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

function SurgeryDateChip({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-300 text-xs">—</span>;
  const days = daysUntil(dateStr);
  const label = dateStr;
  const colour =
    days === null ? "text-gray-400" :
    days < 0     ? "text-red-600 font-semibold" :
    days <= 7    ? "text-amber-600 font-semibold" :
    days <= 30   ? "text-slate-700" :
                   "text-slate-400";
  return (
    <span className={`text-xs ${colour}`}>
      {label}
      {days !== null && days >= 0 && days <= 14 && (
        <span className="ml-1 text-[10px] opacity-70">({days}d)</span>
      )}
    </span>
  );
}

function ExpandedRow({ patient }: { patient: Patient }) {
  const phone = patient.mobile || patient.home_phone;
  const location = [patient.address_suburb, patient.address_state].filter(Boolean).join(", ");

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 px-4 py-4 bg-slate-50 border-t border-gray-100 text-xs">
      {/* Contact */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Contact</p>
        <p className="text-slate-700">{phone || "—"}</p>
        {patient.email && <p className="text-slate-500 truncate">{patient.email}</p>}
        {location && <p className="text-slate-400">{location}</p>}
      </div>

      {/* Clinical */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Clinical</p>
        <p className="text-slate-700">{patient.planned_surgery || "—"}</p>
        {patient.referring_surgeon && (
          <p className="text-slate-500">Ref: {patient.referring_surgeon}</p>
        )}
        {patient.hospital && <p className="text-slate-400">{patient.hospital}</p>}
      </div>

      {/* Insurance */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Insurance</p>
        <p className="text-slate-700">{patient.medicare_number || "—"}</p>
        {patient.health_fund && <p className="text-slate-500">{patient.health_fund}</p>}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 items-start justify-center">
        <Link
          href={`/patients/${patient.id}`}
          className="flex items-center gap-1.5 rounded-md bg-brand-teal text-white text-xs font-medium px-3 py-1.5 hover:opacity-90"
        >
          Open patient <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href={`/patients/${patient.id}?tab=details`}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 text-slate-600 text-xs px-3 py-1.5 hover:bg-white"
        >
          Edit details
        </Link>
      </div>
    </div>
  );
}

function PatientRow({ patient, sharedBy }: { patient: Patient; sharedBy?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className={`border-t border-gray-100 cursor-pointer transition-colors ${open ? "bg-slate-50" : "hover:bg-gray-50"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-brand-teal">
                {patient.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-800 text-sm">{patient.full_name}</p>
                {sharedBy && (
                  <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded-full px-2 py-0.5 font-medium">
                    Shared by {sharedBy}
                  </span>
                )}
              </div>
              {patient.date_of_birth && (
                <p className="text-[10px] text-gray-400">DOB {patient.date_of_birth}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{patient.ur_number}</td>
        <td className="px-4 py-3 text-xs text-slate-600">{patient.planned_surgery || <span className="text-gray-300">—</span>}</td>
        <td className="px-4 py-3"><SurgeryDateChip dateStr={patient.surgery_date} /></td>
        <td className="px-4 py-3 text-xs text-slate-500">{patient.hospital || <span className="text-gray-300">—</span>}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${bloodsBadge(patient.bloods_status)}`}>
            {patient.bloods_status}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="p-0">
            <ExpandedRow patient={patient} />
          </td>
        </tr>
      )}
    </>
  );
}

function groupPatients(patients: Patient[]) {
  const today = new Date().setHours(0, 0, 0, 0);
  const groups: { label: string; patients: Patient[] }[] = [
    { label: "Overdue / past", patients: [] },
    { label: "This week",      patients: [] },
    { label: "This month",     patients: [] },
    { label: "Upcoming",       patients: [] },
    { label: "No date set",    patients: [] },
  ];

  for (const p of patients) {
    if (!p.surgery_date) { groups[4].patients.push(p); continue; }
    const days = daysUntil(p.surgery_date)!;
    if (days < 0)      groups[0].patients.push(p);
    else if (days <= 7) groups[1].patients.push(p);
    else if (days <= 30) groups[2].patients.push(p);
    else                groups[3].patients.push(p);
  }

  return groups.filter((g) => g.patients.length > 0);
}

export default function PatientsTable({
  patients,
  currentUserId,
  sharedByMap,
}: {
  patients: Patient[];
  currentUserId: string;
  sharedByMap: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.ur_number.toLowerCase().includes(q) ||
      (p.planned_surgery ?? "").toLowerCase().includes(q) ||
      (p.hospital ?? "").toLowerCase().includes(q)
    );
  });

  const groups = query.trim() ? [{ label: "Results", patients: filtered }] : groupPatients(filtered);

  // Stats
  const bloodsPending  = patients.filter((p) => p.bloods_status === "pending").length;
  const surgeryThisWeek = patients.filter((p) => { const d = daysUntil(p.surgery_date); return d !== null && d >= 0 && d <= 7; }).length;

  const isGroupOpen = (label: string) => groupOpen[label] !== false; // default open

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <User className="h-4 w-4 text-brand-teal" />
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-medium">Total patients</p>
            <p className="font-semibold text-slate-800">{patients.length}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Calendar className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-medium">Surgery this week</p>
            <p className="font-semibold text-slate-800">{surgeryThisWeek}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Droplets className="h-4 w-4 text-rose-500" />
          <div>
            <p className="text-[10px] uppercase text-gray-400 font-medium">Bloods pending</p>
            <p className="font-semibold text-slate-800">{bloodsPending}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, UR number, surgery or hospital…"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/50 bg-white"
      />

      {/* Groups */}
      <div className="space-y-3">
        {groups.map((group) => {
          const open = isGroupOpen(group.label);
          return (
            <div key={group.label} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Group header — collapsible */}
              <button
                type="button"
                onClick={() => setGroupOpen((s) => ({ ...s, [group.label]: !open }))}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">{group.label}</span>
                  <span className="rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-semibold px-2 py-0.5">
                    {group.patients.length}
                  </span>
                </div>
                {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
              </button>

              {open && (
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-400 text-[11px] uppercase tracking-wide border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 font-medium">Patient</th>
                      <th className="px-4 py-2 font-medium">UR</th>
                      <th className="px-4 py-2 font-medium">Surgery</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Hospital</th>
                      <th className="px-4 py-2 font-medium">Bloods</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.patients.map((p) => (
                      <PatientRow key={p.id} patient={p} sharedBy={sharedByMap[p.id]} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-10 text-center text-gray-400 text-sm">
            {patients.length === 0 ? "No patients yet — add your first patient." : "No patients match your search."}
          </div>
        )}
      </div>
    </div>
  );
}
