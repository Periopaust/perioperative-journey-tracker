import { createClient } from "@/lib/supabase/server";

// Types for the "scheduling" schema — the standalone appointment calendar
// platform's own tables, kept separate from this app's `public.profiles`
// and role model (see /docs/architecture-decisions.md ADR-001/ADR-003 in
// the calendar project). Same Supabase project, same login session, but a
// distinct schema, distinct role vocabulary, and no foreign keys between
// the two.

export type SchedulingRole = "provider" | "reception" | "admin";

export type SchedulingProfile = {
  id: string;
  organisation_id: string;
  full_name: string;
  email: string;
  role: SchedulingRole;
  active: boolean;
};

export async function getCurrentSchedulingProfile(): Promise<SchedulingProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .schema("scheduling")
    .from("profiles")
    .select("id, organisation_id, full_name, email, role, active")
    .eq("id", user.id)
    .maybeSingle();

  return (data as SchedulingProfile | null) ?? null;
}
