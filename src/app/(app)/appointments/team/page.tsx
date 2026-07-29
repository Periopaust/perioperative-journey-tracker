import Link from "next/link";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { createClient } from "@/lib/supabase/server";
import { createTeamMember, grantReceptionAccess, revokeReceptionAccess } from "@/app/actions/scheduling";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  reception: "Reception",
  provider: "Provider",
};

export default async function TeamPage({
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

  // Team management touches other people's login/contact details, so unlike
  // the rest of the Appointments pages this one is admin-only to view, not
  // just admin-only to edit.
  if (schedulingProfile.role !== "admin") {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-gray-600">
          Only an admin can manage the team.{" "}
          <Link href="/appointments" className="text-brand-teal underline">
            Go back
          </Link>
          .
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: members }, { data: providers }, { data: accessGrants }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("profiles")
      .select("id, full_name, email, role, active")
      .order("role")
      .order("full_name"),
    supabase.schema("scheduling").from("providers").select("id, display_name").order("display_name"),
    supabase
      .schema("scheduling")
      .from("reception_provider_access")
      .select("profile_id, provider_id, active"),
  ]);

  const grantedProviderIdsByProfile = new Map<string, Set<string>>();
  for (const grant of accessGrants ?? []) {
    if (!grant.active) continue;
    const set = grantedProviderIdsByProfile.get(grant.profile_id) ?? new Set<string>();
    set.add(grant.provider_id);
    grantedProviderIdsByProfile.set(grant.profile_id, set);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/appointments" className="text-sm text-brand-teal hover:underline">
          ← Appointments
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800 mt-1">Team</h1>
        <p className="text-sm text-gray-500 mt-1">
          Who can access Appointments, and — for reception — which providers&apos; appointments
          they can see and manage.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {members && members.length > 0 ? (
          members.map((member) => {
            const grantedIds = grantedProviderIdsByProfile.get(member.id) ?? new Set<string>();
            return (
              <div key={member.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 text-gray-700 text-xs px-2.5 py-1">
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                </div>

                {member.role === "reception" && (
                  <div className="pl-0 pt-1">
                    <p className="text-xs text-gray-500 mb-1.5">Can see and manage appointments for:</p>
                    {providers && providers.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {providers.map((provider) => {
                          const hasAccess = grantedIds.has(provider.id);
                          return (
                            <form
                              key={provider.id}
                              action={hasAccess ? revokeReceptionAccess : grantReceptionAccess}
                            >
                              <input type="hidden" name="profile_id" value={member.id} />
                              <input type="hidden" name="provider_id" value={provider.id} />
                              <button
                                type="submit"
                                className={`rounded-md px-2.5 py-1 text-xs border transition ${
                                  hasAccess
                                    ? "bg-brand-teal text-white border-brand-teal"
                                    : "bg-white text-gray-600 border-gray-300 hover:border-brand-teal"
                                }`}
                              >
                                {hasAccess ? "✓ " : ""}
                                {provider.display_name}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        No providers yet — add one on the{" "}
                        <Link href="/appointments/providers" className="underline">
                          Providers
                        </Link>{" "}
                        page first.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">No team members yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Add a team member</h2>
        <p className="text-xs text-gray-500 mb-3">
          They need to already have signed in to this app with the email below — this doesn&apos;t
          send an invite, it just grants Appointments access to an existing account.
        </p>
        <form action={createTeamMember} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">Full name</span>
            <input
              name="full_name"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Jane Smith"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Email</span>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="jane@example.com"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Role</span>
            <select
              name="role"
              defaultValue="reception"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="reception">Reception</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition"
          >
            Add team member
          </button>
        </form>
      </div>
    </div>
  );
}
