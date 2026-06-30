"use client";

import { toggleChecklistItem } from "@/app/actions/patients";
import { useTransition } from "react";

export default function ChecklistItemRow({
  item,
  patientId,
}: {
  item: { id: string; item_label: string; completed: boolean; completed_at: string | null };
  patientId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          defaultChecked={item.completed}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() => {
              toggleChecklistItem(item.id, patientId, e.target.checked);
            })
          }
          className="h-4 w-4 accent-[var(--brand-teal)]"
        />
        <span className={item.completed ? "line-through text-gray-400" : ""}>{item.item_label}</span>
      </label>
      {item.completed && item.completed_at && (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {new Date(item.completed_at).toLocaleDateString("en-AU")}
        </span>
      )}
      {!item.completed && (
        <span className="text-xs font-medium text-rose-500 whitespace-nowrap">outstanding</span>
      )}
    </li>
  );
}
