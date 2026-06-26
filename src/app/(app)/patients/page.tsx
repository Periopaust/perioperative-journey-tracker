import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PatientsPage() {
  const supabase = await createClient();
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, ur_number, planned_surgery, surgery_date, hospital, bloods_status")
    .order("surgery_date", { ascending: true, nullsFirst: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Patients</h1>
        <Link
          href="/patients/new"
          className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          + New patient
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">UR Number</th>
              <th className="px-4 py-2">Planned surgery</th>
              <th className="px-4 py-2">Surgery date</th>
              <th className="px-4 py-2">Hospital</th>
              <th className="px-4 py-2">Bloods</th>
            </tr>
          </thead>
          <tbody>
            {patients?.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/patients/${p.id}`} className="font-medium text-brand-teal hover:underline">
                    {p.full_name}
                  </Link>
                </td>
                <td className="px-4 py-2">{p.ur_number}</td>
                <td className="px-4 py-2">{p.planned_surgery}</td>
                <td className="px-4 py-2">{p.surgery_date ?? "—"}</td>
                <td className="px-4 py-2">{p.hospital}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.bloods_status === "received"
                        ? "bg-green-100 text-green-700"
                        : p.bloods_status === "ordered"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {p.bloods_status}
                  </span>
                </td>
              </tr>
            ))}
            {!patients?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No patients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
