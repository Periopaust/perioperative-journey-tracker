import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, CATEGORY_ORDER, type ChecklistCategory } from "@/lib/checklist";
import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";

export default async function ExportPatientPage({
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
    .select("category, item_label, completed, completed_at, sort_order")
    .eq("patient_id", id)
    .order("sort_order");

  const { data: notes } = await supabase
    .from("clinical_notes")
    .select("note, created_at")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  const itemsByCategory = (category: ChecklistCategory) =>
    items?.filter((i) => i.category === category) ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-end mb-4 print:hidden">
        <PrintButton />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-8 space-y-6 text-sm">
        <div>
          <h1 className="text-lg font-bold text-brand-teal">Perioperative Australia — Patient Summary</h1>
          <p className="text-gray-500">Generated {new Date().toLocaleString("en-AU")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <p><strong>Name:</strong> {patient.full_name}</p>
          <p><strong>DOB:</strong> {patient.date_of_birth}</p>
          <p><strong>UR Number:</strong> {patient.ur_number}</p>
          <p><strong>Referring surgeon:</strong> {patient.referring_surgeon ?? "—"}</p>
          <p><strong>Planned surgery:</strong> {patient.planned_surgery ?? "—"}</p>
          <p><strong>Surgery date:</strong> {patient.surgery_date ?? "—"}</p>
          <p><strong>Hospital:</strong> {patient.hospital ?? "—"}</p>
          <p><strong>Bloods status:</strong> {patient.bloods_status}</p>
        </div>

        <div>
          <h2 className="font-semibold mb-2">Journey checklist</h2>
          {CATEGORY_ORDER.map((category) => (
            <div key={category} className="mb-3">
              <p className="font-medium">{CATEGORY_LABELS[category]}</p>
              <ul className="list-disc ml-5">
                {itemsByCategory(category).map((item, i) => (
                  <li key={i}>
                    {item.completed ? "[x]" : "[ ]"} {item.item_label}
                    {item.completed && item.completed_at && (
                      <span className="text-gray-400">
                        {" "}
                        ({new Date(item.completed_at).toLocaleDateString("en-AU")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div>
          <h2 className="font-semibold mb-2">Clinical notes</h2>
          {notes?.length ? (
            <ul className="space-y-1">
              {notes.map((n, i) => (
                <li key={i}>
                  <span className="text-gray-400">{new Date(n.created_at).toLocaleString("en-AU")}:</span>{" "}
                  {n.note}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No notes recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
