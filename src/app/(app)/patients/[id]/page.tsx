import { createClient } from "@/lib/supabase/server";
import BloodsStatusSelect from "./BloodsStatusSelect";
import LettersPanel from "./LettersPanel";
import PatientProfilePanel from "./PatientProfilePanel";
import SharePanel from "./SharePanel";
import ChecklistItemRow from "./ChecklistItemRow";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, type ChecklistCategory } from "@/lib/checklist";
import { getPatientShares } from "@/app/actions/sharing";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).single();
  if (!patient) notFound();

  const shares = await getPatientShares(id);
  const isOwner = patient.created_by === user?.id;

  const { data: letters } = await supabase
    .from("letters")
    .select("id, letter_code, procedure_type, priority, letter_to, recipient_name, cc, template, content, status, docx_path, notes, created_at")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  const { data: checklistItems } = await supabase
    .from("checklist_items")
    .select("id, item_label, completed, completed_at, category")
    .eq("patient_id", id)
    .order("created_at", { ascending: true });

  const activeTab = tabParam ?? "letters";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">{patient.full_name}</h1>
          <p className="text-sm text-gray-500">
            UR {patient.ur_number} · DOB {patient.date_of_birth}
            {patient.referring_surgeon && ` · Ref: ${patient.referring_surgeon}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SharePanel patientId={id} isOwner={isOwner} shares={shares} />
          <BloodsStatusSelect patientId={id} status={patient.bloods_status} />
        </div>
      </div>

      {/* Quick surgery bar */}
      {(patient.planned_surgery || patient.hospital || patient.surgery_date) && (
        <div className="flex gap-6 text-sm bg-white border border-gray-200 rounded-xl px-4 py-3">
          <Info label="Planned surgery" value={patient.planned_surgery} />
          <Info label="Surgery date" value={patient.surgery_date} />
          <Info label="Hospital" value={patient.hospital} />
        </div>
      )}

      {/* Tabs */}
      <Tabs activeTab={activeTab} patientId={id} />

      {/* Tab content */}
      {activeTab === "details" && (
        <PatientProfilePanel patient={patient} />
      )}

      {activeTab === "letters" && (
        <LettersPanel
          patientId={id}
          referringSurgeon={patient.referring_surgeon}
          letters={letters ?? []}
        />
      )}

      {(activeTab === "clinical" || activeTab === "admin") && (
        <ChecklistSection
          items={(checklistItems ?? []).filter((i) => i.category === activeTab)}
          patientId={id}
          category={activeTab as ChecklistCategory}
        />
      )}
    </div>
  );
}

function Tabs({ activeTab, patientId }: { activeTab: string; patientId: string }) {
  const tabs = [
    { key: "letters", label: "Letters" },
    { key: "details", label: "Patient details" },
    { key: "clinical", label: "Clinical checklist" },
    { key: "admin", label: "Admin checklist" },
  ];

  return (
    <div className="flex gap-0 border-b border-gray-200">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={`/patients/${patientId}?tab=${t.key}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === t.key
              ? "border-brand-teal text-brand-teal"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}

function ChecklistSection({
  items,
  patientId,
  category,
}: {
  items: { id: string; item_label: string; completed: boolean; completed_at: string | null; category: string }[];
  patientId: string;
  category: ChecklistCategory;
}) {
  const outstanding = items.filter((i) => !i.completed).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{CATEGORY_LABELS[category]}</h2>
        {outstanding > 0 && (
          <span className="text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-full px-2.5 py-0.5">
            {outstanding} outstanding
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} patientId={patientId} />
        ))}
      </ul>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-gray-400 text-[10px] uppercase font-medium">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  );
}
