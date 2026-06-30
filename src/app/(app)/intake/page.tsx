import { createClient } from "@/lib/supabase/server";
import IntakeSearch from "./IntakeSearch";

export default async function IntakePage() {
  const supabase = await createClient();
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, planned_surgery")
    .order("full_name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">Periop intake</h1>
        <p className="text-sm text-gray-500">
          Generate a pre-operative letter from referral documents or a consultation transcript.
        </p>
      </div>

      <IntakeSearch patients={patients ?? []} />
    </div>
  );
}
