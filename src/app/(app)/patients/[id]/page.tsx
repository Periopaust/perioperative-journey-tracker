import { createClient } from "@/lib/supabase/server";
import BloodsStatusSelect from "./BloodsStatusSelect";
import LettersPanel from "./LettersPanel";
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

  const { data: letters } = await supabase
    .from("letters")
    .select("id, letter_code, procedure_type, priority, letter_to, recipient_name, cc, template, content, status, docx_path, notes, created_at")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">{patient.full_name}</h1>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm bg-white border border-gray-200 rounded-xl p-4">
        <Info label="Referring surgeon" value={patient.referring_surgeon} />
        <Info label="Planned surgery" value={patient.planned_surgery} />
        <Info label="Surgery date" value={patient.surgery_date} />
        <Info label="Hospital" value={patient.hospital} />
        <div>
          <p className="text-gray-400 text-xs uppercase mb-1">Bloods status</p>
          <BloodsStatusSelect patientId={id} status={patient.bloods_status} />
        </div>
      </div>

      <LettersPanel patientId={id} referringSurgeon={patient.referring_surgeon} letters={letters ?? []} />
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
