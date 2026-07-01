import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PatientsTable from "./PatientsTable";
import { getSharesForCurrentUser } from "@/app/actions/sharing";

export default async function PatientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, planned_surgery, surgery_date, hospital, bloods_status, date_of_birth, mobile, home_phone, email, referring_surgeon, medicare_number, health_fund, address_suburb, address_state, created_by")
    .order("surgery_date", { ascending: true, nullsFirst: false });

  const { sharedWithMe } = await getSharesForCurrentUser();

  // Build a map: patient_id → owner name for shared patients
  const sharedByMap: Record<string, string> = {};
  for (const s of sharedWithMe) {
    sharedByMap[s.patient_id] = (s.owner as any)?.full_name ?? "Another clinician";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">Patients</h1>
        <Link
          href="/patients/new"
          className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          + New patient
        </Link>
      </div>

      <PatientsTable
        patients={patients ?? []}
        currentUserId={user?.id ?? ""}
        sharedByMap={sharedByMap}
      />
    </div>
  );
}
