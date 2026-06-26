import { createClient } from "@/lib/supabase/server";
import { addClinicalNote } from "@/app/actions/patients";
import ChecklistTabs from "./ChecklistTabs";
import BloodsStatusSelect from "./BloodsStatusSelect";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).single();
  if (!patient) notFound();

  const { data: items } = await supabase
    .from("checklist_items")
    .select("id, category, item_key, item_label, completed, completed_at, sort_order")
    .eq("patient_id", id)
    .order("sort_order");

  const { data: notes } = await supabase
    .from("clinical_notes")
    .select("id, note, created_at, author_id, profiles(full_name)")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{patient.full_name}</h1>
          <p className="text-sm text-gray-500">
            UR {patient.ur_number} · DOB {patient.date_of_birth}
          </p>
        </div>
        <Link
          href={`/patients/${id}/export`}
          className="rounded-md border border-brand-teal text-brand-teal text-sm font-medium px-4 py-2 hover:bg-brand-teal/5"
        >
          Export summary
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-white border border-gray-200 rounded-lg p-4">
        <Info label="Referring surgeon" value={patient.referring_surgeon} />
        <Info label="Planned surgery" value={patient.planned_surgery} />
        <Info label="Surgery date" value={patient.surgery_date} />
        <Info label="Hospital" value={patient.hospital} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
        <span className="text-sm font-medium">Bloods status:</span>
        <BloodsStatusSelect patientId={id} status={patient.bloods_status} />
      </div>

      <ChecklistTabs items={items ?? []} patientId={id} />

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Clinical notes</h2>
        <form
          action={async (formData) => {
            "use server";
            await addClinicalNote(id, formData);
          }}
          className="flex gap-2 mb-4"
        >
          <input
            name="note"
            placeholder="Add a clinical note..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          <button className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90">
            Add
          </button>
        </form>

        <ul className="space-y-3">
          {notes?.map((n) => (
            <li key={n.id} className="text-sm border-l-2 border-brand-yellow pl-3">
              <p>{n.note}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {/* @ts-expect-error joined relation typing */}
                {n.profiles?.full_name ?? "Unknown"} · {new Date(n.created_at).toLocaleString("en-AU")}
              </p>
            </li>
          ))}
          {!notes?.length && <p className="text-sm text-gray-400">No notes yet.</p>}
        </ul>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-gray-400 text-xs uppercase">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}
