"use client";

import { updatePatientBloodsStatus } from "@/app/actions/patients";
import { useTransition } from "react";

export default function BloodsStatusSelect({
  patientId,
  status,
}: {
  patientId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      name="bloods_status"
      defaultValue={status}
      disabled={isPending}
      onChange={(e) =>
        startTransition(() => {
          updatePatientBloodsStatus(patientId, e.target.value);
        })
      }
      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
    >
      <option value="pending">Pending</option>
      <option value="ordered">Ordered</option>
      <option value="received">Received</option>
    </select>
  );
}
