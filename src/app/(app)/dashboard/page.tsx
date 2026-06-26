import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date();
  const in14Days = new Date(today);
  in14Days.setDate(today.getDate() + 14);

  const { data: pendingBloods } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, surgery_date, bloods_status")
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
      <h1 className="text-xl font-bold">Dashboard</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <AlertCard
          title="Pending bloods"
          accent="bg-red-50 border-red-200"
          empty="No pending bloods."
        >
          {pendingBloods?.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0 hover:text-brand-teal"
            >
              <span>{p.full_name} ({p.ur_number})</span>
              <span className="text-gray-400">{p.surgery_date ?? "no date"}</span>
            </Link>
          ))}
        </AlertCard>

        <AlertCard
          title="Upcoming surgeries (next 14 days)"
          accent="bg-yellow-50 border-yellow-200"
          empty="No surgeries scheduled in the next 14 days."
        >
          {upcomingSurgeries?.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0 hover:text-brand-teal"
            >
              <span>{p.full_name} ({p.ur_number})</span>
              <span className="text-gray-400">{p.surgery_date} · {p.hospital}</span>
            </Link>
          ))}
        </AlertCard>
      </div>
    </div>
  );
}

function AlertCard({
  title,
  accent,
  empty,
  children,
}: {
  title: string;
  accent: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={`border rounded-lg p-4 ${accent}`}>
      <h2 className="font-semibold mb-2">{title}</h2>
      {hasChildren ? children : <p className="text-sm text-gray-500">{empty}</p>}
    </div>
  );
}
