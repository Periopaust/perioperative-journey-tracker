import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import JourneyTabs from "./JourneyTabs";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase.from("patients").select("full_name, ur_number, date_of_birth, planned_surgery, surgery_date").eq("id", id).single();
  if (!patient) notFound();

  const { data: items } = await supabase
    .from("checklist_items")
    .select("id, category, item_key, item_label, completed, completed_at, sort_order")
    .eq("patient_id", id)
    .order("sort_order");

  const { data: notes } = await supabase
    .from("clinical_notes")
    .select("id, note, created_at, profiles(full_name)")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">{patient.full_name}</h1>
          <p className="text-sm text-gray-500">UR {patient.ur_number} · {patient.planned_surgery} · {patient.surgery_date ?? "date TBC"}</p>
        </div>
        <Link
          href={`/patients/${id}`}
          className="rounded-md border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 hover:bg-gray-50 transition"
        >
          ← Letters
        </Link>
      </div>

      <JourneyTabs patientId={id} items={items ?? []} notes={notes ?? []} />
    </div>
  );
}
