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
  const [{ data: providers }, { data: locations }, { data: rules }, { data: organisation }] = await Promise.all([
    supabase.schema("scheduling").from("providers").select("id, display_name").order("display_name"),
    supabase.schema("scheduling").from("locations").select("id, name").order("name"),
    supabase
      .schema("scheduling")
      .from("availability_rules")
      .select("id, provider_id, location_id, day_of_week, start_local_time, end_local_time, effective_from, effective_until")
      .eq("active", true),
    supabase
      .schema("scheduling")
      .from("organisations")
      .select("default_timezone")
      .eq("id", schedulingProfile.organisation_id)
      .single(),
  ]);

  const activeProvider =
    (requestedProviderId && providers?.find((p) => p.id === requestedProviderId)) || providers?.[0] || null;

  const locationNameById = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const providerRules = (rules ?? []).filter((rule) => rule.provider_id === activeProvider?.id);
  const timezone = organisation?.default_timezone ?? "Australia/Sydney";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">
          A read-only preview of a provider&apos;s weekly hours, built from the Availability rules you&apos;ve
          set up. Bookable appointments aren&apos;t wired up yet — this confirms the grid renders correctly
          against real data first.
        </p>
      </div>

      {!providers || providers.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          Add a{" "}
          <Link href="/appointments/providers" className="underline">
            provider
          </Link>{" "}
          and some{" "}
          <Link href="/appointments/availability" className="underline">
            weekly availability
          </Link>{" "}
          first — there&apos;s nothing to show on the calendar yet.
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

          {providerRules.length === 0 ? (
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
              locationNameById={locationNameById}
              timezone={timezone}
              providerName={activeProvider?.display_name ?? ""}
            />
          )}
        </>
      )}
    </div>
  );
}
