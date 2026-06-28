import { getCurrentProfile } from "@/lib/auth";
import { notFound } from "next/navigation";
import AdminPurgePanel from "./AdminPurgePanel";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Admin</h1>
      <AdminPurgePanel />
    </div>
  );
}
