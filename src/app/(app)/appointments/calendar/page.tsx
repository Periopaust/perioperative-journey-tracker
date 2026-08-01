import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createPersonalEvent, deletePersonalEvent } from "@/app/actions/scheduling";
import { AvailabilityWeekCalendar } from "./week-calendar";

function formatEventRange(startAt: string, endAt: string, timezone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateFmt = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; error?: string }>;
}) {
  const { provider: requestedProviderId, error } = await searchParams;
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
  const todayIso = nowIso.slice(0, 10);
  const [
    { data: allProviders, error: providersError },
    { data: locations, error: locationsError },
    { data: rules, error: rulesError },
    { data: appointmentTypes, error: appointmentTypesError },
    { data: appointments, error: appointmentsError },
    { data: organisation, error: organisationError },
    { data: ownAccessGrants, error: accessGrantsError },
    { data: overrides, error: overridesError },
    { data: personalEvents, error: personalEventsError },
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
      supabase
        .schema("scheduling")
        .from("availability_overrides")
        .select("id, provider_id, override_date, is_available, start_local_time, end_local_time, location_id, reason")
        .gte("override_date", todayIso),
      supabase
        .schema("scheduling")
        .from("personal_events")
        .select("id, provider_id, title, start_at, end_at, notes")
        .gte("end_at", nowIso)
        .order("start_at"),
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
    ["availability_overrides", overridesError],
    ["personal_events", personalEventsError],
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
  const providerOverrides = (overrides ?? []).filter((override) => override.provider_id === activeProvider?.id);
  const providerPersonalEvents = (personalEvents ?? []).filter((event) => event.provider_id === activeProvider?.id);
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

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

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

          {providerRules.length === 0 &&
          providerAppointments.length === 0 &&
          providerOverrides.length === 0 &&
          providerPersonalEvents.length === 0 ? (
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
              overrides={providerOverrides}
              personalEvents={providerPersonalEvents}
              locationNameById={locationNameById}
              appointmentTypeNameById={appointmentTypeNameById}
              timezone={timezone}
              providerName={activeProvider?.display_name ?? ""}
            />
          )}

          {schedulingProfile.role === "admin" && activeProvider && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">
                  Personal events for {activeProvider.display_name}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Meetings, admin time, or anything else that isn&apos;t a patient appointment — shown in purple
                  on the calendar above.
                </p>
              </div>

              {providerPersonalEvents.length > 0 && (
                <ul className="space-y-1">
                  {providerPersonalEvents.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>
                        <span className="text-gray-700 font-medium">{event.title}</span> ·{" "}
                        {formatEventRange(event.start_at, event.end_at, timezone)}
                        {event.notes ? ` · ${event.notes}` : ""}
                      </span>
                      <form action={deletePersonalEvent}>
                        <input type="hidden" name="event_id" value={event.id} />
                        <input type="hidden" name="provider_id" value={activeProvider.id} />
                        <button type="submit" className="text-red-600 hover:underline shrink-0">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form action={createPersonalEvent} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="provider_id" value={activeProvider.id} />
                <label className="block text-sm col-span-2">
                  <span className="text-gray-700">Title</span>
                  <input
                    name="title"
                    required
                    placeholder="Team meeting"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm col-span-2">
                  <span className="text-gray-700">Date</span>
                  <input
                    type="date"
                    name="date"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">Start time</span>
                  <input
                    type="time"
                    name="start_local_time"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">End time</span>
                  <input
                    type="time"
                    name="end_local_time"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm col-span-2">
                  <span className="text-gray-700">Notes (optional)</span>
                  <input
                    name="notes"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="col-span-2">
                  <button
                    type="submit"
                    className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                  >
                    Add personal event
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
