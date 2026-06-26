"use client";

import { useState } from "react";
import ChecklistItemRow from "./ChecklistItemRow";
import { CATEGORY_LABELS, type ChecklistCategory } from "@/lib/checklist";

type ChecklistItem = {
  id: string;
  item_label: string;
  completed: boolean;
  completed_at: string | null;
  category: ChecklistCategory;
};

export default function ChecklistTabs({
  items,
  patientId,
}: {
  items: ChecklistItem[];
  patientId: string;
}) {
  const [tab, setTab] = useState<ChecklistCategory>("clinical");

  const tabItems = items.filter((i) => i.category === tab);
  const outstanding = tabItems.filter((i) => !i.completed).length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex gap-2 mb-3 border-b border-gray-100">
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
                <span className="ml-1.5 inline-block rounded-full bg-red-100 text-red-700 text-xs px-1.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {outstanding > 0 && (
        <p className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-1.5 mb-3">
          {outstanding} outstanding item{outstanding > 1 ? "s" : ""} in {CATEGORY_LABELS[tab]}
        </p>
      )}

      <ul className="space-y-2">
        {tabItems.map((item) => (
          <ChecklistItemRow key={item.id} item={item} patientId={patientId} />
        ))}
      </ul>
    </div>
  );
}
