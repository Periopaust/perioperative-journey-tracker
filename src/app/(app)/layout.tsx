import { getCurrentProfile } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import Sidebar from "./Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen flex">
      <Sidebar isAdmin={profile?.role === "admin"} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <span className="font-bold text-brand-teal">
            Perioperative <span className="text-gray-900">Australia</span>
          </span>

          <div className="flex items-center gap-3 text-sm">
            {profile && (
              <span className="text-gray-600">
                {profile.full_name} · <span className="capitalize">{profile.role}</span>
              </span>
            )}
            <form action={logout}>
              <button className="rounded-md bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-xs font-medium transition">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 w-full px-6 py-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
