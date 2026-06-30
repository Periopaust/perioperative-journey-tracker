"use client";

import { useState } from "react";
import Link from "next/link";

type Patient = {
  id: string;
  full_name: string;
  ur_number: string;
  planned_surgery: string | null;
  surgery_date: string | null;
  hospital: string | null;
  bloods_status: string;
};

export default function PatientsTable({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState("");

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.full_name.toLowerCase().includes(q) || p.ur_number.toLowerCase().includes(q);
  });

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or UR number"
        className="w-full mb-4 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
      />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">UR Number</th>
              <th className="px-4 py-2">Planned surgery</th>
              <th className="px-4 py-2">Surgery date</th>
              <th className="px-4 py-2">Hospital</th>
              <th className="px-4 py-2">Bloods</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/patients/${p.id}`} className="font-medium text-brand-teal hover:underline">
                    {p.full_name}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.ur_number}</td>
                <td className="px-4 py-2">{p.planned_surgery}</td>
                <td className="px-4 py-2">{p.surgery_date ?? "—"}</td>
                <td className="px-4 py-2">{p.hospital}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.bloods_status === "received"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.bloods_status === "ordered"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {p.bloods_status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  {patients.length === 0 ? "No patients yet." : "No patients match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
