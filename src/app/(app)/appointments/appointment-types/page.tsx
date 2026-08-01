import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createAppointmentType, toggleAppointmentTypeAiBookable } from "@/app/actions/scheduling";

const BOOKING_MODES = [
  { value: "in_person", label: "In person" },
  { value: "telehealth", label: "Telehealth" },
  { value: "hospital", label: "Hospital" },
  { value: "procedure", label: "Procedure" },
  { value: "other", label: "Other" },
];

export default async function AppointmentTypesPage({
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
  const { data: appointmentTypes } = await supabase
    .schema("scheduling")
    .from("appointment_types")
    .select("id, name, description, default_duration_minutes, booking_mode, ai_bookable")
    .eq("active", true)
    .order("name");

  const bookingModeLabel = (value: string) =>
    BOOKING_MODES.find((mode) => mode.value === value)?.label ?? value;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Appointment types</h1>
        <p className="text-sm text-gray-500 mt-1">
          What a booking actually is — a consult, a procedure, a telehealth review — and how long it
          takes by default.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {appointmentTypes && appointmentTypes.length > 0 ? (
          appointmentTypes.map((type) => (
            <div key={type.id} className="px-5 py-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{type.name}</p>
                <p className="text-xs text-gray-500">
                  {type.default_duration_minutes} min · {bookingModeLabel(type.booking_mode)}
                </p>
                {type.description && <p className="text-xs text-gray-500 mt-1">{type.description}</p>}
              </div>
              {schedulingProfile.role === "admin" && (
                <form action={toggleAppointmentTypeAiBookable} className="shrink-0 text-right">
                  <input type="hidden" name="appointment_type_id" value={type.id} />
                  <input type="hidden" name="next_value" value={(!type.ai_bookable).toString()} />
                  <button
                    type="submit"
                    className={`text-xs rounded-full px-2.5 py-1 border transition ${
                      type.ai_bookable
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400"
                    }`}
                    title={type.ai_bookable ? "Bookable via the public AI assistant — click to turn off" : "Not bookable via the public AI assistant — click to turn on"}
                  >
                    {type.ai_bookable ? "AI-bookable ✓" : "AI-bookable off"}
                  </button>
                </form>
              )}
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No appointment types added yet.</p>
        )}
      </div>

      {schedulingProfile.role === "admin" && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add an appointment type</h2>
          <form action={createAppointmentType} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Name</span>
              <input
                name="name"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="New patient consult"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Description</span>
              <input
                name="description"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-700">Duration (minutes)</span>
                <input
                  type="number"
                  name="default_duration_minutes"
                  defaultValue={30}
                  min={5}
                  step={5}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Mode</span>
                <select
                  name="booking_mode"
                  defaultValue="in_person"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {BOOKING_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="ai_bookable" className="rounded border-gray-300" />
              Allow booking via the public AI assistant (/book)
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Add appointment type
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
