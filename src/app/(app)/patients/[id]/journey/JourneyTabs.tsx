"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChecklistItemRow from "../ChecklistItemRow";
import { CATEGORY_LABELS, type ChecklistCategory } from "@/lib/checklist";
import { addClinicalNote } from "@/app/actions/patients";

type ChecklistItem = {
  id: string;
  item_label: string;
  completed: boolean;
  completed_at: string | null;
  category: ChecklistCategory;
};

type Note = {
  id: string;
  note: string;
  created_at: string;
  profiles: { full_name: string }[] | { full_name: string } | null;
};

export default function JourneyTabs({
  patientId,
  items,
  notes,
}: {
  patientId: string;
  items: ChecklistItem[];
  notes: Note[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ChecklistCategory>("clinical");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);

  const tabItems = items.filter((i) => i.category === tab);
  const outstanding = tabItems.filter((i) => !i.completed).length;

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteInput.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("note", noteInput.trim());
    await addClinicalNote(patientId, fd);
    setNoteInput("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-100">
        {(["clinical", "admin"] as ChecklistCategory[]).map((c) => {
          const count = items.filter((i) => i.category === c && !i.completed).length;
          return (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
                tab === c
                  ? "border-brand-teal text-brand-teal"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {CATEGORY_LABELS[c]}
              {count > 0 && (
                <span className="ml-1.5 inline-block rounded-full bg-rose-50 text-rose-700 text-xs px-1.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Checklist */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {outstanding > 0 && (
          <p className="text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-1.5">
            {outstanding} outstanding item{outstanding > 1 ? "s" : ""} in {CATEGORY_LABELS[tab]}
          </p>
        )}
        <ul className="space-y-2">
          {tabItems.map((item) => (
            <ChecklistItemRow key={item.id} item={item} patientId={patientId} />
          ))}
        </ul>

        {/* Add note */}
        <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-gray-100">
          <input
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <button
            type="submit"
            disabled={saving || !noteInput.trim()}
            className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      </div>

      {/* Notes history */}
      {notes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">Notes</h3>
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="text-sm border-l-2 border-brand-yellow pl-3">
                <p>{n.note}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {Array.isArray(n.profiles) ? n.profiles[0]?.full_name : n.profiles?.full_name ?? "Unknown"} · {new Date(n.created_at).toLocaleString("en-AU")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
