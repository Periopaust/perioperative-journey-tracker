import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityWeekCalendar } from "./week-calendar";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const { provider: requestedProviderId } = await searchParams;
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

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [
    { data: allProviders, error: providersError },
    { data: locations, error: locationsError },
    { data: rules, error: rulesError },
    { data: appointmentTypes, error: appointmentTypesError },
    { data: appointments, error: appointmentsError },
    { data: organisation, error: organisationError },
    { data: ownAccessGrants, error: accessGrantsError },
  ] = await Promise.all([
      supabase.schema("scheduling").from("providers").select("id, display_name").order("display_name"),
      supabase.schema("scheduling").from("locations").select("id, name").order("name"),
      supabase
        .schema("scheduling")
        .from("availability_rules")
        .select("id, provider_id, location_id, day_of_week, start_local_time, end_local_time, effective_from, effective_until")
        .eq("active", true),
      supabase.schema("scheduling").from("appointment_types").select("id, name").eq("active", true),
      supabase
        .schema("scheduling")
        .from("appointments")
        .select("id, provider_id, location_id, appointment_type_id, start_at, end_at, contact_name")
        .neq("status", "cancelled")
        .gte("end_at", nowIso),
      supabase
        .schema("scheduling")
        .from("organisations")
        .select("default_timezone")
        .eq("id", schedulingProfile.organisation_id)
        .single(),
      schedulingProfile.role === "reception"
        ? supabase
            .schema("scheduling")
            .from("reception_provider_access")
            .select("provider_id")
            .eq("profile_id", schedulingProfile.id)
            .eq("active", true)
        : Promise.resolve({ data: null, error: null }),
    ]);

  // These are non-fatal (the page below already falls back to empty
  // arrays/defaults for each), but any Postgres/RLS error here would
  // otherwise fail completely silently — surface it in Vercel's server
  // logs so a "calendar shows nothing" report is diagnosable.
  for (const [label, err] of [
    ["providers", providersError],
    ["locations", locationsError],
    ["availability_rules", rulesError],
    ["appointment_types", appointmentTypesError],
    ["appointments", appointmentsError],
    ["organisations", organisationError],
    ["reception_provider_access", accessGrantsError],
  ] as const) {
    if (err) console.error(`[appointments/calendar] failed to load ${label}`, err);
  }

  // Admin sees every provider; reception only sees the ones they've been
  // explicitly granted (scheduling.reception_provider_access) — this is a
  // UX/defense-in-depth scoping on top of RLS, which already refuses to
  // return appointment rows for a provider reception hasn't been granted
  // regardless of what this filter does.
  const providers =
    schedulingProfile.role === "reception"
      ? (allProviders ?? []).filter((p) =>
          (ownAccessGrants ?? []).some((grant) => grant.provider_id === p.id),
        )
      : allProviders;

  const activeProvider =
    (requestedProviderId && providers?.find((p) => p.id === requestedProviderId)) || providers?.[0] || null;

  const locationNameById = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const appointmentTypeNameById = new Map((appointmentTypes ?? []).map((type) => [type.id, type.name]));
  const providerRules = (rules ?? []).filter((rule) => rule.provider_id === activeProvider?.id);
  const providerAppointments = (appointments ?? []).filter(
    (appointment) => appointment.provider_id === activeProvider?.id,
  );
  const timezone = organisation?.default_timezone ?? "Australia/Sydney";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
            ← Appointments
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            A provider&apos;s weekly hours (light) with actual booked appointments (teal) laid on top.
          </p>
        </div>
        <Link
          href="/appointments/book"
          className="shrink-0 rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
        >
          Book appointment
        </Link>
      </div>

      {!providers || providers.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          {schedulingProfile.role === "reception" ? (
            "You don't have access to any providers yet — ask an admin to grant it on the Team page."
          ) : (
            <>
              Add a{" "}
              <Link href="/appointments/providers" className="underline">
                provider
              </Link>{" "}
              and some{" "}
              <Link href="/appointments/availability" className="underline">
                weekly availability
              </Link>{" "}
              first — there&apos;s nothing to show on the calendar yet.
            </>
          )}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <Link
                key={provider.id}
                href={`/appointments/calendar?provider=${provider.id}`}
                className={`rounded-md px-3 py-1.5 text-sm border transition ${
                  provider.id === activeProvider?.id
                    ? "bg-brand-teal text-white border-brand-teal"
                    : "bg-white text-gray-700 border-gray-300 hover:border-brand-teal"
                }`}
              >
                {provider.display_name}
              </Link>
            ))}
          </div>

          {providerRules.length === 0 && providerAppointments.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              {activeProvider?.display_name} has no weekly hours set yet. Add some on the{" "}
              <Link href="/appointments/availability" className="underline">
                Availability
              </Link>{" "}
              page to see them here.
            </p>
          ) : (
            <AvailabilityWeekCalendar
              rules={providerRules}
              appointments={providerAppointments}
              locationNameById={locationNameById}
              appointmentTypeNameById={appointmentTypeNameById}
              timezone={timezone}
              providerName={activeProvider?.display_name ?? ""}
            />
          )}
        </>
      )}
    </div>
  );
}
