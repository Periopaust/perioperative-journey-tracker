import { createClient } from "@/lib/supabase/server";
import DashboardLists from "./DashboardLists";

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const in14Days = new Date(today);
  in14Days.setDate(today.getDate() + 14);

  const { data: pendingBloods } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, surgery_date, bloods_status, bloods_expected_date")
    .neq("bloods_status", "received")
    .order("surgery_date", { ascending: true, nullsFirst: false });

  const { data: upcomingSurgeries } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, surgery_date, hospital")
    .gte("surgery_date", today.toISOString().slice(0, 10))
    .lte("surgery_date", in14Days.toISOString().slice(0, 10))
    .order("surgery_date", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">Dashboard</h1>
      <DashboardLists pendingBloods={pendingBloods ?? []} upcomingSurgeries={upcomingSurgeries ?? []} />
    </div>
  );
}
