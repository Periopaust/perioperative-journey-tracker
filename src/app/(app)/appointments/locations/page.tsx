import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createLocation } from "@/app/actions/scheduling";

export default async function LocationsPage({
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
  const { data: locations } = await supabase
    .schema("scheduling")
    .from("locations")
    .select("id, name, address, phone")
    .order("name");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Locations</h1>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {locations && locations.length > 0 ? (
          locations.map((location) => (
            <div key={location.id} className="px-5 py-3">
              <p className="text-sm font-medium text-gray-900">{location.name}</p>
              {location.address && <p className="text-xs text-gray-500">{location.address}</p>}
              {location.phone && <p className="text-xs text-gray-500">{location.phone}</p>}
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No locations added yet.</p>
        )}
      </div>

      {schedulingProfile.role === "admin" && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add a location</h2>
          <form action={createLocation} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">Name</span>
              <input
                name="name"
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Main clinic"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Address</span>
              <input
                name="address"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">Phone</span>
              <input
                name="phone"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
            >
              Add location
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
