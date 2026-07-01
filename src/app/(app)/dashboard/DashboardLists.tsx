"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Droplets, Calendar } from "lucide-react";

type PatientRow = {
  id: string;
  full_name: string;
  ur_number: string;
  surgery_date: string | null;
  hospital?: string | null;
  bloods_status?: string;
  bloods_expected_date?: string | null;
};

function CollapsibleCard({
  title,
  icon,
  count,
  accentBorder,
  accentHeader,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  accentBorder: string;
  accentHeader: string;
  empty: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = Array.isArray(children) ? (children as React.ReactNode[]).filter(Boolean).length > 0 : !!children;

  return (
    <div className={`border rounded-xl overflow-hidden ${accentBorder}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 ${accentHeader}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <span className="rounded-full bg-white/60 text-slate-600 text-[11px] font-semibold px-2 py-0.5">
            {count}
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 py-3 bg-white">
          {hasChildren ? children : (
            <p className="text-sm text-gray-400 py-2">{empty}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardLists({
  pendingBloods,
  upcomingSurgeries,
}: {
  pendingBloods: PatientRow[];
  upcomingSurgeries: PatientRow[];
}) {
  const [query, setQuery] = useState("");

  function matches(p: PatientRow) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.full_name.toLowerCase().includes(q) || p.ur_number.toLowerCase().includes(q);
  }

  const filteredBloods = pendingBloods.filter(matches);
  const filteredSurgeries = upcomingSurgeries.filter(matches);

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or UR number"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/50 bg-white"
      />

      <div className="grid md:grid-cols-2 gap-4">
        <CollapsibleCard
          title="Pending bloods"
          icon={<Droplets className="h-4 w-4 text-rose-500" />}
          count={filteredBloods.length}
          accentBorder="border-rose-200"
          accentHeader="bg-rose-50"
          empty="No pending bloods."
        >
          {filteredBloods.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between items-start text-sm py-2 border-b border-gray-100 last:border-0 hover:text-brand-teal gap-4"
            >
              <span className="text-slate-700">{p.full_name} <span className="text-gray-400 text-xs">({p.ur_number})</span></span>
              <div className="text-right shrink-0">
                <p className="text-gray-400 text-xs">{p.surgery_date ?? "no surgery date"}</p>
                {p.bloods_expected_date && (
                  <p className="text-amber-600 text-[11px] font-medium">Bloods due {p.bloods_expected_date}</p>
                )}
              </div>
            </Link>
          ))}
        </CollapsibleCard>

        <CollapsibleCard
          title="Upcoming surgeries (next 14 days)"
          icon={<Calendar className="h-4 w-4 text-amber-500" />}
          count={filteredSurgeries.length}
          accentBorder="border-amber-200"
          accentHeader="bg-amber-50"
          empty="No surgeries scheduled in the next 14 days."
        >
          {filteredSurgeries.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between text-sm py-2 border-b border-gray-100 last:border-0 hover:text-brand-teal"
            >
              <span className="text-slate-700">{p.full_name} <span className="text-gray-400 text-xs">({p.ur_number})</span></span>
              <span className="text-gray-400 text-xs">{p.surgery_date} · {p.hospital}</span>
            </Link>
          ))}
        </CollapsibleCard>
      </div>
    </div>
  );
}
