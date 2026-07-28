import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createProvider } from "@/app/actions/scheduling";

export default async function ProvidersPage({
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
  const [{ data: providers }, { data: locations }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("providers")
      .select("id, display_name, provider_type, default_location_id")
      .order("display_name"),
    supabase.schema("scheduling").from("locations").select("id, name").order("name"),
  ]);

  const locationNameById = new Map((locations ?? []).map((location) => [location.id, location.name]));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Providers</h1>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {providers && providers.length > 0 ? (
          providers.map((provider) => (
            <div key={provider.id} className="px-5 py-3">
              <p className="text-sm font-medium text-gray-900">{provider.display_name}</p>
              <p className="text-xs text-gray-500">
                {provider.provider_type ?? "Provider"}
                {provider.default_location_id && locationNameById.get(provider.default_location_id)
                  ? ` · ${locationNameById.get(provider.default_location_id)}`
                  : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No providers added yet.</p>
        )}
      </div>

      {schedulingProfile.role === "admin" && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add a provider</h2>
          {(!locations || locations.length === 0) && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2 mb-3">
              Tip: add a{" "}
              <Link href="/appointments/locations" className="underline">
                location
              </Link>{" "}
              first so you can assign this provider to one — it&apos;s optional, but most
              providers have one.
            </p>
          )}
          <form action={createProvider} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Name</span>
              <input
                name="display_name"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Dr Jane Smith"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Type</span>
              <input
                name="provider_type"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Surgeon"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Default location</span>
              <select
                name="default_location_id"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {locations?.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Slot length (minutes)</span>
              <input
                type="number"
                name="slot_interval_minutes"
                defaultValue={15}
                min={5}
                step={5}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Add provider
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
