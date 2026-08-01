import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABELS: Record<string, string> = {
  "appointment.created": "Booked an appointment",
  "appointment.cancelled": "Cancelled an appointment",
  "reception_access.granted": "Granted reception access",
  "reception_access.revoked": "Revoked reception access",
  "team_member.added": "Added a team member",
  "availability_override.created": "Added a one-off availability change",
  "availability_override.deleted": "Removed a one-off availability change",
  "personal_event.created": "Added a personal event",
  "personal_event.deleted": "Removed a personal event",
};

function formatTimestamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const entries = Object.entries(details as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ");
}

export default async function AuditLogPage() {
  const schedulingProfile = await getCurrentSchedulingProfile();

  if (!schedulingProfile) {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-gray-600">
          Appointments hasn&apos;t been set up yet.{" "}
          <Link href="/appointments" className="text-brand-teal underline">
            Go back
          </Link>
          .
        </p>
      </div>
    );
  }

  // Audit trail is sensitive (it shows who did what, across everyone in the
  // practice) so — unlike most other Appointments pages — this one is
  // admin-only to view at all, not just admin-only to edit. Same reasoning
  // as the Team page.
  if (schedulingProfile.role !== "admin") {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-gray-600">
          Only an admin can view the audit log.{" "}
          <Link href="/appointments" className="text-brand-teal underline">
            Go back
          </Link>
          .
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: events }, { data: organisation }, { data: profiles }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("audit_events")
      .select("id, actor_id, action, table_name, record_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .schema("scheduling")
      .from("organisations")
      .select("default_timezone")
      .eq("id", schedulingProfile.organisation_id)
      .maybeSingle(),
    supabase.schema("scheduling").from("profiles").select("id, full_name"),
  ]);

  const timezone = organisation?.default_timezone ?? "Australia/Sydney";
  const actorNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Audit log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Who did what across Appointments — bookings, cancellations, access changes, and team changes.
          Showing the most recent {events?.length ?? 0} entries. This list can&apos;t be edited or deleted.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {events && events.length > 0 ? (
          events.map((event) => {
            const detailsText = formatDetails(event.details);
            return (
              <div key={event.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">
                      {(event.actor_id && actorNameById.get(event.actor_id)) ?? "Unknown user"}
                    </span>{" "}
                    {ACTION_LABELS[event.action] ?? event.action}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">{formatTimestamp(event.created_at, timezone)}</span>
                </div>
                {detailsText && <p className="text-xs text-gray-500 mt-0.5">{detailsText}</p>}
              </div>
            );
          })
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No activity recorded yet.</p>
        )}
      </div>
    </div>
  );
}
