"use client";

import { toggleChecklistItem } from "@/app/actions/patients";
import { useTransition } from "react";

export default function ChecklistItemRow({
  item,
  patientId,
}: {
  item: { id: string; item_label: string; completed: boolean };
  patientId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center gap-2 text-sm">
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
    </li>
  );
}
