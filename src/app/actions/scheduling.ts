"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
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

// Admin-only. Runs on the normal session-scoped client (not the service-role
// admin client) — RLS's existing "locations_admin_write" policy is what
// actually gates this, so a non-admin session gets rejected by the database
// itself even if this role check were ever bypassed.
export async function createLocation(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/locations?error=" + encodeURIComponent("Only an admin can add locations."));
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/appointments/locations?error=" + encodeURIComponent("Location name is required."));
  }
  const address = String(formData.get("address") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("locations")
    .insert({
      organisation_id: schedulingProfile.organisation_id,
      name,
      address,
      phone,
    });

  if (error) {
    console.error(error);
    redirect("/appointments/locations?error=" + encodeURIComponent("Could not add location. Please try again."));
  }

  revalidatePath("/appointments/locations");
  redirect("/appointments/locations");
}

// Admin-only, same RLS-backed pattern as createLocation above.
export async function createProvider(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/providers?error=" + encodeURIComponent("Only an admin can add providers."));
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    redirect("/appointments/providers?error=" + encodeURIComponent("Provider name is required."));
  }
  const providerType = String(formData.get("provider_type") ?? "").trim() || null;
  const defaultLocationId = String(formData.get("default_location_id") ?? "").trim() || null;
  const slotIntervalRaw = Number(formData.get("slot_interval_minutes"));
  const slotIntervalMinutes =
    Number.isFinite(slotIntervalRaw) && slotIntervalRaw > 0 ? Math.round(slotIntervalRaw) : 15;

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("providers")
    .insert({
      organisation_id: schedulingProfile.organisation_id,
      display_name: displayName,
      provider_type: providerType,
      default_location_id: defaultLocationId,
      slot_interval_minutes: slotIntervalMinutes,
    });

  if (error) {
    console.error(error);
    redirect("/appointments/providers?error=" + encodeURIComponent("Could not add provider. Please try again."));
  }

  revalidatePath("/appointments/providers");
  redirect("/appointments/providers");
}

// Admin-only, same RLS-backed pattern. Providers will also be able to
// manage their own rules directly once provider logins exist (RLS policy
// "availability_rules_provider_own_write" already supports it) — this
// action just isn't exposed to non-admins in the UI yet.
export async function createAvailabilityRule(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/availability?error=" + encodeURIComponent("Only an admin can set availability."));
  }

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const dayOfWeek = Number(formData.get("day_of_week"));
  const startTime = String(formData.get("start_local_time") ?? "").trim();
  const endTime = String(formData.get("end_local_time") ?? "").trim();

  if (
    !providerId ||
    !locationId ||
    !startTime ||
    !endTime ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    redirect("/appointments/availability?error=" + encodeURIComponent("Please fill in every field."));
  }
  if (endTime <= startTime) {
    redirect("/appointments/availability?error=" + encodeURIComponent("End time must be after start time."));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("availability_rules")
    .insert({
      provider_id: providerId,
      location_id: locationId,
      day_of_week: dayOfWeek,
      start_local_time: startTime,
      end_local_time: endTime,
    });

  if (error) {
    console.error(error);
    redirect("/appointments/availability?error=" + encodeURIComponent("Could not add availability. Please try again."));
  }

  revalidatePath("/appointments/availability");
  redirect("/appointments/availability");
}

// Admin-only. Hard delete is fine here — availability_rules has no
// dependents yet (no appointments table exists to reference it).
export async function deleteAvailabilityRule(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/availability?error=" + encodeURIComponent("Only an admin can remove availability."));
  }

  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) redirect("/appointments/availability");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("availability_rules")
    .delete()
    .eq("id", ruleId);

  if (error) {
    console.error(error);
    redirect("/appointments/availability?error=" + encodeURIComponent("Could not remove availability. Please try again."));
  }

  revalidatePath("/appointments/availability");
  redirect("/appointments/availability");
}
