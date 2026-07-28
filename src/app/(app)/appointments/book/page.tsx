import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createAppointment, cancelAppointment } from "@/app/actions/scheduling";

function formatRange(startAt: string, endAt: string, timezone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

export default async function BookAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
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
  const [{ data: providers }, { data: locations }, { data: appointmentTypes }, { data: appointments }, { data: organisation }] =
    await Promise.all([
      supabase.schema("scheduling").from("providers").select("id, display_name").order("display_name"),
      supabase.schema("scheduling").from("locations").select("id, name").order("name"),
      supabase
        .schema("scheduling")
        .from("appointment_types")
        .select("id, name, default_duration_minutes")
        .eq("active", true)
        .order("name"),
      supabase
        .schema("scheduling")
        .from("appointments")
        .select("id, provider_id, location_id, appointment_type_id, start_at, end_at, contact_name, status")
        .neq("status", "cancelled")
        .gte("end_at", nowIso)
        .order("start_at"),
      supabase
        .schema("scheduling")
        .from("organisations")
        .select("default_timezone")
        .eq("id", schedulingProfile.organisation_id)
        .maybeSingle(),
    ]);

  const timezone = organisation?.default_timezone ?? "Australia/Sydney";
  const providerNameById = new Map((providers ?? []).map((p) => [p.id, p.display_name]));
  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const typeNameById = new Map((appointmentTypes ?? []).map((t) => [t.id, t.name]));

  const nothingToBookWith = !providers?.length || !locations?.length || !appointmentTypes?.length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments/calendar" className="text-sm text-brand-teal hover:underline">
          ← Calendar
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Book an appointment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Direct staff booking — the time is checked against the provider&apos;s existing appointments at
          the database level, so two bookings can never land on the same slot.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}
      {success && (
        <p className="rounded-md bg-emerald-50 text-emerald-700 text-sm px-3 py-2">Appointment booked.</p>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Upcoming</h2>
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {appointments && appointments.length > 0 ? (
            appointments.map((appointment) => (
              <div key={appointment.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{appointment.contact_name}</p>
                  <p className="text-xs text-gray-500">
                    {formatRange(appointment.start_at, appointment.end_at, timezone)} ·{" "}
                    {providerNameById.get(appointment.provider_id) ?? "Unknown provider"} ·{" "}
                    {locationNameById.get(appointment.location_id) ?? "Unknown location"} ·{" "}
                    {typeNameById.get(appointment.appointment_type_id) ?? "Unknown type"}
                  </p>
                </div>
                {schedulingProfile.role === "admin" && (
                  <form action={cancelAppointment}>
                    <input type="hidden" name="appointment_id" value={appointment.id} />
                    <button type="submit" className="text-red-600 hover:underline text-sm shrink-0">
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-gray-500">No upcoming appointments.</p>
          )}
        </div>
      </div>

      {schedulingProfile.role === "admin" && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">New appointment</h2>

          {nothingToBookWith ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              You&apos;ll need at least one{" "}
              <Link href="/appointments/providers" className="underline">
                provider
              </Link>
              ,{" "}
              <Link href="/appointments/locations" className="underline">
                location
              </Link>
              , and{" "}
              <Link href="/appointments/appointment-types" className="underline">
                appointment type
              </Link>{" "}
              before you can book something.
            </p>
          ) : (
            <form action={createAppointment} className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">Provider</span>
                <select
                  name="provider_id"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {providers!.map((provider) => (
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
                  {locations!.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Appointment type</span>
                <select
                  name="appointment_type_id"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {appointmentTypes!.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.default_duration_minutes} min)
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
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
                    name="start_time"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-700">Patient / contact name</span>
                <input
                  name="contact_name"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-700">Phone</span>
                  <input
                    name="contact_phone"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">Email</span>
                  <input
                    type="email"
                    name="contact_email"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-700">Reason for booking</span>
                <input
                  name="reason_for_booking"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
              >
                Book appointment
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
