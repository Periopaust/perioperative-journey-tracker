"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function purgeOldRecords(retentionDays: number = 365) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("purge_old_records", {
    retention_days: retentionDays,
  });

  if (error) {
    return { error: error.message };
  }

  return { result: data?.[0] ?? { purged_patients: 0, purged_audit_rows: 0 } };
}
