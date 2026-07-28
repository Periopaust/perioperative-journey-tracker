import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { bootstrapScheduling } from "@/app/actions/scheduling";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const journeyProfile = await getCurrentProfile();
  const schedulingProfile = await getCurrentSchedulingProfile();

  if (!schedulingProfile) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">Appointments</h1>

        {error && (
          <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>
        )}

        {journeyProfile?.role === "admin" ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
            <p className="text-sm text-gray-600">
              Appointments hasn&apos;t been set up for your practice yet. This creates the
              scheduling workspace and gives you admin access to it — providers and
              secretaries are added from here afterwards.
            </p>
            <form action={bootstrapScheduling} className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">Practice name</span>
                <input
                  name="organisation_name"
                  defaultValue="Perioperative Australia"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
              >
                Set up Appointments
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Appointments hasn&apos;t been set up for your practice yet. Ask your admin to
            open this page and set it up, then they can grant you access.
          </p>
        )}
      </div>
    );
  }

  const supabase = await createClient();
  const [{ count: providerCount }, { count: locationCount }, { count: availabilityCount }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("providers")
      .select("id", { count: "exact", head: true }),
    supabase
      .schema("scheduling")
      .from("locations")
      .select("id", { count: "exact", head: true }),
    supabase
      .schema("scheduling")
      .from("availability_rules")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
  ]);
  const hasAvailability = (availabilityCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">Appointments</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-1">
        <p className="text-sm text-gray-600">
          Signed in as <span className="font-medium text-gray-900">{schedulingProfile.full_name}</span>{" "}
          · <span className="capitalize">{schedulingProfile.role}</span>
        </p>
        <p className="text-sm text-gray-500">
          The calendar view is a read-only preview for now — booking isn&apos;t wired up yet. Set up
          your providers, locations, and their weekly hours here first.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-3xl">
        <Link
          href="/appointments/providers"
          className="rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-teal transition"
        >
          <p className="text-sm font-medium text-gray-900">Providers</p>
          <p className="text-xs text-gray-500 mt-1">{providerCount ?? 0} added</p>
        </Link>
        <Link
          href="/appointments/locations"
          className="rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-teal transition"
        >
          <p className="text-sm font-medium text-gray-900">Locations</p>
          <p className="text-xs text-gray-500 mt-1">{locationCount ?? 0} added</p>
        </Link>
        <Link
          href="/appointments/availability"
          className="rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-teal transition"
        >
          <p className="text-sm font-medium text-gray-900">Availability</p>
          <p className="text-xs text-gray-500 mt-1">{availabilityCount ?? 0} rules set</p>
        </Link>
        <Link
          href="/appointments/calendar"
          className="rounded-lg border border-gray-200 bg-white p-5 hover:border-brand-teal transition"
        >
          <p className="text-sm font-medium text-gray-900">Calendar</p>
          <p className="text-xs text-gray-500 mt-1">
            {hasAvailability ? "Read-only preview" : "Nothing to show yet"}
          </p>
        </Link>
      </div>
    </div>
  );
}
