"use client";

import { useState, useEffect } from "react";
import LettersPanel from "../patients/[id]/LettersPanel";

type PatientRow = {
  id: string;
  full_name: string;
  ur_number: string;
  planned_surgery: string | null;
};

type Letter = {
  id: string;
  letter_code: string;
  procedure_type: string | null;
  priority: "routine" | "urgent";
  letter_to: "doctor" | "patient";
  recipient_name: string | null;
  cc: string | null;
  template: string | null;
  content: string | null;
  status: "draft" | "reviewed" | "sent";
  docx_path: string | null;
  notes: string | null;
  created_at: string;
};

export default function IntakeSearch({ patients }: { patients: PatientRow[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PatientRow | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.full_name.toLowerCase().includes(q) || p.ur_number.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!selected) return;

    setLoading(true);
    fetch(`/api/patients/${selected.id}/letters`)
      .then((res) => res.json())
      .then((data) => setLetters(data.letters || []))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <label className="block text-sm font-medium mb-1">Select patient</label>
        <input
          value={selected ? `${selected.full_name} (${selected.ur_number})` : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
          placeholder="Search by name or UR number"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />

        {!selected && query.trim() && (
          <div className="mt-2 border border-gray-200 rounded-md overflow-hidden">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p);
                  setQuery("");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <strong>{p.full_name}</strong> ({p.ur_number}){p.planned_surgery ? ` · ${p.planned_surgery}` : ""}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No matching patients.</p>}
          </div>
        )}
      </div>

      {selected && (
        loading ? (
          <p className="text-sm text-gray-400">Loading letters...</p>
        ) : (
          <LettersPanel patientId={selected.id} letters={letters} />
        )
      )}
    </div>
  );
}
