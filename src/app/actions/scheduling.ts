"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// One-time setup: creates the first scheduling.organisations row and makes
// the caller its first scheduling admin. Gated on the caller already being
// an admin in this app's own (public.profiles) role system — the scheduling
// schema has no rows yet for anyone to be scoped by, so this one action
// necessarily runs with the service-role client (server-side only, per
// /docs/architecture.md's "no service-role key in browser code" rule).
export async function bootstrapScheduling(formData: FormData) {
  const journeyProfile = await getCurrentProfile();
  if (!journeyProfile) redirect("/login");
  if (journeyProfile.role !== "admin") {
    redirect("/appointments?error=" + encodeURIComponent("Only an admin can set up Appointments."));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organisationName =
    String(formData.get("organisation_name") ?? "").trim() || "Perioperative Australia";

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .schema("scheduling")
    .from("organisations")
    .insert({ name: organisationName, default_timezone: "Australia/Sydney" })
    .select("id")
    .single();

  if (orgError) {
    console.error(orgError);
    redirect("/appointments?error=" + encodeURIComponent("Could not set up Appointments. Please try again."));
  }

  const { error: profileError } = await admin
    .schema("scheduling")
    .from("profiles")
    .insert({
      id: user!.id,
      organisation_id: org!.id,
      full_name: journeyProfile.full_name,
      email: user!.email ?? "",
      role: "admin",
    });

  if (profileError) {
    console.error(profileError);
    redirect("/appointments?error=" + encodeURIComponent("Could not finish setting up Appointments."));
  }

  revalidatePath("/appointments");
  redirect("/appointments");
}
