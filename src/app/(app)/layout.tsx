import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { logout } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-teal text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold">
              Perioperative <span className="text-brand-yellow">Australia</span>
            </span>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="hover:text-brand-yellow">Dashboard</Link>
              <Link href="/patients" className="hover:text-brand-yellow">Patients</Link>
              <Link href="/templates" className="hover:text-brand-yellow">Templates</Link>
              {profile?.role === "admin" && (
                <Link href="/admin" className="hover:text-brand-yellow">Admin</Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {profile && (
              <span className="opacity-90">
                {profile.full_name} · <span className="capitalize">{profile.role}</span>
              </span>
            )}
            <form action={logout}>
              <button className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1 text-xs transition">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">{children}</main>
    </div>
  );
}
