"use client";

import { useState, useRef } from "react";
import ChecklistItemRow from "./ChecklistItemRow";
import LettersPanel from "./LettersPanel";
import { CATEGORY_LABELS, type ChecklistCategory } from "@/lib/checklist";
import { addClinicalNote } from "@/app/actions/patients";

type ChecklistItem = {
  id: string;
  item_label: string;
  completed: boolean;
  completed_at: string | null;
  category: ChecklistCategory;
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
  status: "draft" | "reviewed" | "sent";
  docx_path: string | null;
  notes: string | null;
  created_at: string;
};

type Tab = ChecklistCategory | "letters";

export default function ChecklistTabs({
  items,
  patientId,
  letters,
}: {
  items: ChecklistItem[];
  patientId: string;
  letters: Letter[];
}) {
  const [tab, setTab] = useState<Tab>("letters");

  const tabItems = tab === "letters" ? [] : items.filter((i) => i.category === tab);
  const outstanding = tabItems.filter((i) => !i.completed).length;

  return (
    <div>
      <div className="flex gap-2 mb-3 border-b border-gray-100">
        <button
          onClick={() => setTab("letters")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
            tab === "letters"
              ? "border-brand-teal text-brand-teal"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Letters
          {letters.length > 0 && (
            <span className="ml-1.5 inline-block rounded-full bg-gray-100 text-gray-600 text-xs px-1.5">
              {letters.length}
            </span>
          )}
        </button>

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

      {tab === "letters" ? (
        <LettersPanel patientId={patientId} letters={letters} />
      ) : (
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

          {/* Quick note */}
          <form
            action={async (formData) => {
              await addClinicalNote(patientId, formData);
            }}
            className="flex gap-2 pt-2 border-t border-gray-100"
          >
            <input
              name="note"
              placeholder="Add a note…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
