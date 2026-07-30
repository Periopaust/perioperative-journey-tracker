import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  createAvailabilityOverride,
  deleteAvailabilityOverride,
} from "@/app/actions/scheduling";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(value: string) {
  // value comes back from Postgres as "HH:MM:SS" — trim to "HH:MM" for display.
  return value.slice(0, 5);
}

function formatDate(value: string) {
  // value comes back from Postgres as "YYYY-MM-DD" — parse as a plain date
  // (not a UTC instant) so it doesn't shift a day depending on the server's
  // timezone.
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
  const todayIso = new Date().toISOString().slice(0, 10);
  const [{ data: providers }, { data: locations }, { data: rules }, { data: overrides }] = await Promise.all([
    supabase.schema("scheduling").from("providers").select("id, display_name").order("display_name"),
    supabase.schema("scheduling").from("locations").select("id, name").order("name"),
    supabase
      .schema("scheduling")
      .from("availability_rules")
      .select("id, provider_id, location_id, day_of_week, start_local_time, end_local_time")
      .eq("active", true)
      .order("day_of_week"),
    // Only upcoming ones, so this list doesn't grow forever with past leave.
    supabase
      .schema("scheduling")
      .from("availability_overrides")
      .select("id, provider_id, override_date, is_available, start_local_time, end_local_time, location_id, reason")
      .gte("override_date", todayIso)
      .order("override_date"),
  ]);

  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));

  const rulesByProvider = new Map<string, typeof rules>();
  for (const rule of rules ?? []) {
    const existing = rulesByProvider.get(rule.provider_id) ?? [];
    existing.push(rule);
    rulesByProvider.set(rule.provider_id, existing);
  }

  const overridesByProvider = new Map<string, typeof overrides>();
  for (const override of overrides ?? []) {
    const existing = overridesByProvider.get(override.provider_id) ?? [];
    existing.push(override);
    overridesByProvider.set(override.provider_id, existing);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Weekly recurring hours for each provider — this is what the calendar view will use
          to know when a provider can be booked.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

      {!providers || providers.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          Add a{" "}
          <Link href="/appointments/providers" className="underline">
            provider
          </Link>{" "}
          first — availability is set per provider.
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {providers.map((provider) => {
            const providerRules = rulesByProvider.get(provider.id) ?? [];
            return (
              <div key={provider.id} className="px-5 py-3">
                <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
                {providerRules.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {providerRules.map((rule) => (
                      <li key={rule.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {DAY_LABELS[rule.day_of_week]} {formatTime(rule.start_local_time)}–
                          {formatTime(rule.end_local_time)}
                          {locationNameById.get(rule.location_id)
                            ? ` · ${locationNameById.get(rule.location_id)}`
                            : ""}
                        </span>
                        {schedulingProfile.role === "admin" && (
                          <form action={deleteAvailabilityRule}>
                            <input type="hidden" name="rule_id" value={rule.id} />
                            <button type="submit" className="text-red-600 hover:underline">
                              Remove
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No hours set yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {schedulingProfile.role === "admin" && providers && providers.length > 0 && locations && locations.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add weekly hours</h2>
          <form action={createAvailabilityRule} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Provider</span>
              <select
                name="provider_id"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Location</span>
              <select
                name="location_id"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Day</span>
              <select
                name="day_of_week"
                required
                defaultValue={1}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {DAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-700">Start time</span>
                <input
                  type="time"
                  name="start_local_time"
                  required
                  defaultValue="09:00"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">End time</span>
                <input
                  type="time"
                  name="end_local_time"
                  required
                  defaultValue="17:00"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Add hours
            </button>
          </form>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-800">One-off changes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Leave, sick days, or a single day with different hours — these apply on top of the
          weekly hours above, just for the date given.
        </p>
      </div>

      {providers && providers.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {providers.map((provider) => {
            const providerOverrides = overridesByProvider.get(provider.id) ?? [];
            return (
              <div key={provider.id} className="px-5 py-3">
                <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
                {providerOverrides.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {providerOverrides.map((override) => (
                      <li key={override.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {override.is_available ? "Extra: " : "Unavailable: "}
                          {formatDate(override.override_date)}
                          {override.start_local_time && override.end_local_time
                            ? ` ${formatTime(override.start_local_time)}–${formatTime(override.end_local_time)}`
                            : " (all day)"}
                          {override.location_id && locationNameById.get(override.location_id)
                            ? ` · ${locationNameById.get(override.location_id)}`
                            : ""}
                          {override.reason ? ` · ${override.reason}` : ""}
                        </span>
                        {schedulingProfile.role === "admin" && (
                          <form action={deleteAvailabilityOverride}>
                            <input type="hidden" name="override_id" value={override.id} />
                            <button type="submit" className="text-red-600 hover:underline shrink-0 ml-2">
                              Remove
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No upcoming changes.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {schedulingProfile.role === "admin" && providers && providers.length > 0 && locations && locations.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add a one-off change</h2>
          <form action={createAvailabilityOverride} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Provider</span>
              <select
                name="provider_id"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Type</span>
              <select
                name="kind"
                defaultValue="unavailable"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="unavailable">Unavailable (leave, sick day…)</option>
                <option value="extra">Extra availability</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Date</span>
              <input
                type="date"
                name="override_date"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-700">Start time</span>
                <input
                  type="time"
                  name="start_local_time"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">End time</span>
                <input
                  type="time"
                  name="end_local_time"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <p className="text-xs text-gray-400 -mt-1">
              Leave both times blank to block the whole day. Extra availability needs a start
              time, end time, and location.
            </p>
            <label className="block text-sm">
              <span className="text-gray-700">Location (required for extra availability)</span>
              <select
                name="location_id"
                defaultValue=""
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Reason (optional)</span>
              <input
                name="reason"
                placeholder="Annual leave, conference, covering another clinic…"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Add change
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
