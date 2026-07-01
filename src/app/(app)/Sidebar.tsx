"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ShieldCheck, Route, type LucideIcon } from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
];

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const items = isAdmin
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : NAV_ITEMS;

  // Extract patient id from /patients/[id] or /patients/[id]/... paths
  const patientMatch = pathname.match(/^\/patients\/([^/]+)/);
  const patientId = patientMatch ? patientMatch[1] : null;
  const journeyHref = patientId ? `/patients/${patientId}/journey` : "/patients";
  const journeyActive = pathname.includes("/journey");

  return (
    <aside className="w-16 bg-brand-navy flex flex-col items-center py-4 gap-1.5 shrink-0">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (pathname.startsWith(href + "/") && !pathname.includes("/journey"));
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`w-11 h-11 rounded-lg flex items-center justify-center transition ${
              active ? "bg-brand-teal text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={19} strokeWidth={1.8} />
          </Link>
        );
      })}

      {/* Journey tracker — contextual: links to current patient's journey if on a patient page */}
      <Link
        href={journeyHref}
        title="Patient journey"
        className={`w-11 h-11 rounded-lg flex items-center justify-center transition ${
          journeyActive ? "bg-brand-teal text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Route size={19} strokeWidth={1.8} />
      </Link>
    </aside>
  );
}
