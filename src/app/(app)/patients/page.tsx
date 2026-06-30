import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PatientsTable from "./PatientsTable";

export default async function PatientsPage() {
  const supabase = await createClient();
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, planned_surgery, surgery_date, hospital, bloods_status")
    .order("surgery_date", { ascending: true, nullsFirst: false });

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

      <PatientsTable patients={patients ?? []} />
    </div>
  );
}
