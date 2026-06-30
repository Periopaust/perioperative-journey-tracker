"use client";

import { useState } from "react";
import Link from "next/link";

type PatientRow = {
  id: string;
  full_name: string;
  ur_number: string;
  surgery_date: string | null;
  hospital?: string | null;
};

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
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
      />

      <div className="grid md:grid-cols-2 gap-4">
        <AlertCard title="Pending bloods" accent="bg-rose-50/60 border-rose-200" empty="No pending bloods.">
          {filteredBloods.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0 hover:text-brand-teal"
            >
              <span>{p.full_name} ({p.ur_number})</span>
              <span className="text-gray-400">{p.surgery_date ?? "no date"}</span>
            </Link>
          ))}
        </AlertCard>

        <AlertCard
          title="Upcoming surgeries (next 14 days)"
          accent="bg-amber-50/60 border-amber-200"
          empty="No surgeries scheduled in the next 14 days."
        >
          {filteredSurgeries.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0 hover:text-brand-teal"
            >
              <span>{p.full_name} ({p.ur_number})</span>
              <span className="text-gray-400">{p.surgery_date} · {p.hospital}</span>
            </Link>
          ))}
        </AlertCard>
      </div>
    </div>
  );
}

function AlertCard({
  title,
  accent,
  empty,
  children,
}: {
  title: string;
  accent: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={`border rounded-lg p-4 ${accent}`}>
      <h2 className="font-semibold mb-2">{title}</h2>
      {hasChildren ? children : <p className="text-sm text-gray-500">{empty}</p>}
    </div>
  );
}
