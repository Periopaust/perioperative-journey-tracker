"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { getCurrentSchedulingProfile } from "@/lib/scheduling/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Temporal } from "temporal-polyfill";

// Append-only audit trail (scheduling.audit_events) — best-effort logging
// that runs on the normal session client so RLS's own
// "audit_events_insert_self" policy is what actually stops anyone from
// forging an entry as someone else or another organisation. A logging
// failure is swallowed (just logged to the server console) rather than
// thrown, since the real action it's recording has already succeeded by
// the time this runs — an audit-log hiccup should never turn a successful
// booking/grant/etc. into a user-facing error.
async function logAuditEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    organisationId: string;
    actorId: string | null;
    action: string;
    tableName: string;
    recordId?: string | null;
    details?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.schema("scheduling").from("audit_events").insert({
    organisation_id: params.organisationId,
    actor_id: params.actorId,
    action: params.action,
    table_name: params.tableName,
    record_id: params.recordId ?? null,
    details: params.details ?? null,
  });
  if (error) console.error("[audit] failed to log event", params.action, error);
}

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

// Admin-only. Hard delete is fine here — nothing references
// availability_rules.id as a foreign key (appointments is booked against
// providers/locations directly, not against a specific availability rule).
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

// Admin-only, same pattern as createAvailabilityRule — a one-off exception
// to a provider's weekly hours for a single date: either blocking time off
// (leave the times blank for the whole day, or set a time range for part
// of it) or adding extra availability outside their normal hours (which
// requires a time range and a location, since "extra availability" with no
// hours doesn't mean anything).
export async function createAvailabilityOverride(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/availability?error=" + encodeURIComponent("Only an admin can set availability."));
  }

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const overrideDate = String(formData.get("override_date") ?? "").trim();
  const isAvailable = String(formData.get("kind") ?? "") === "extra";
  const startTime = String(formData.get("start_local_time") ?? "").trim() || null;
  const endTime = String(formData.get("end_local_time") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!providerId || !overrideDate) {
    redirect("/appointments/availability?error=" + encodeURIComponent("Please choose a provider and date."));
  }
  if ((startTime && !endTime) || (!startTime && endTime)) {
    redirect(
      "/appointments/availability?error=" +
        encodeURIComponent("Please set both a start and end time, or leave both blank for the whole day."),
    );
  }
  if (startTime && endTime && endTime <= startTime) {
    redirect("/appointments/availability?error=" + encodeURIComponent("End time must be after start time."));
  }
  if (isAvailable && (!startTime || !endTime || !locationId)) {
    redirect(
      "/appointments/availability?error=" +
        encodeURIComponent("Extra availability needs a start time, end time, and location."),
    );
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .schema("scheduling")
    .from("availability_overrides")
    .insert({
      provider_id: providerId,
      override_date: overrideDate,
      is_available: isAvailable,
      start_local_time: startTime,
      end_local_time: endTime,
      location_id: locationId,
      reason,
      created_by: schedulingProfile.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    redirect("/appointments/availability?error=" + encodeURIComponent("Could not save that change. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "availability_override.created",
    tableName: "availability_overrides",
    recordId: inserted?.id ?? null,
    details: { provider_id: providerId, override_date: overrideDate, is_available: isAvailable },
  });

  revalidatePath("/appointments/availability");
  revalidatePath("/appointments/calendar");
  redirect("/appointments/availability");
}

// Admin-only. Hard delete is fine here for the same reason as
// deleteAvailabilityRule — nothing references availability_overrides.id.
export async function deleteAvailabilityOverride(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/availability?error=" + encodeURIComponent("Only an admin can remove availability changes."));
  }

  const overrideId = String(formData.get("override_id") ?? "").trim();
  if (!overrideId) redirect("/appointments/availability");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("availability_overrides")
    .delete()
    .eq("id", overrideId);

  if (error) {
    console.error(error);
    redirect("/appointments/availability?error=" + encodeURIComponent("Could not remove that change. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "availability_override.deleted",
    tableName: "availability_overrides",
    recordId: overrideId,
  });

  revalidatePath("/appointments/availability");
  revalidatePath("/appointments/calendar");
  redirect("/appointments/availability");
}

// Admin-only. scheduling.appointment_types already existed in the database
// from the original Phase 1 migration (with RLS already in place) — this is
// just the first UI for managing it.
export async function createAppointmentType(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/appointment-types?error=" + encodeURIComponent("Only an admin can add appointment types."));
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/appointments/appointment-types?error=" + encodeURIComponent("Name is required."));
  }
  const description = String(formData.get("description") ?? "").trim() || null;
  const durationRaw = Number(formData.get("default_duration_minutes"));
  const defaultDurationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : 30;
  const bookingMode = String(formData.get("booking_mode") ?? "in_person").trim();

  const supabase = await createClient();
  const { error: appointmentTypeError } = await supabase
    .schema("scheduling")
    .from("appointment_types")
    .insert({
      organisation_id: schedulingProfile.organisation_id,
      name,
      description,
      default_duration_minutes: defaultDurationMinutes,
      booking_mode: bookingMode,
    });

  if (appointmentTypeError) {
    console.error(appointmentTypeError);
    redirect("/appointments/appointment-types?error=" + encodeURIComponent("Could not add appointment type. Please try again."));
  }

  revalidatePath("/appointments/appointment-types");
  redirect("/appointments/appointment-types");
}

// Admin-only, direct staff booking (source defaults to 'staff'). Duration is
// always recomputed server-side from the chosen appointment type's own
// default_duration_minutes — never trusted from the form — so a tampered
// hidden field can't be used to under/overstate how long a slot is held.
// The database's exclusion constraint (appointments_no_overlap) is the real
// backstop against double-booking; this action just turns that into a
// readable error instead of a raw Postgres one.
export async function createAppointment(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin" && schedulingProfile.role !== "reception") {
    redirect("/appointments/book?error=" + encodeURIComponent("Only an admin or reception can book appointments."));
  }
  // Admin can book against any provider in the org; reception can only book
  // against providers they've been explicitly granted. Both are enforced
  // again at the database level by RLS (appointments_admin_all /
  // appointments_reception_granted_all) regardless of what this check does —
  // this is just what turns a denied insert into a readable error instead of
  // a raw Postgres one.

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const appointmentTypeId = String(formData.get("appointment_type_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const reasonForBooking = String(formData.get("reason_for_booking") ?? "").trim() || null;

  if (!providerId || !locationId || !appointmentTypeId || !date || !startTime || !contactName) {
    redirect("/appointments/book?error=" + encodeURIComponent("Please fill in every required field."));
  }

  const supabase = await createClient();
  const [{ data: appointmentType }, { data: organisation }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("appointment_types")
      .select("default_duration_minutes")
      .eq("id", appointmentTypeId)
      .maybeSingle(),
    supabase
      .schema("scheduling")
      .from("organisations")
      .select("default_timezone")
      .eq("id", schedulingProfile.organisation_id)
      .maybeSingle(),
  ]);

  if (!appointmentType) {
    redirect("/appointments/book?error=" + encodeURIComponent("That appointment type could not be found."));
  }

  const timezone = organisation?.default_timezone ?? "Australia/Sydney";
  const [hourStr, minuteStr] = startTime.split(":");

  let startAt: Temporal.ZonedDateTime;
  try {
    startAt = Temporal.PlainDate.from(date).toZonedDateTime({
      timeZone: timezone,
      plainTime: { hour: Number(hourStr), minute: Number(minuteStr) },
    });
  } catch {
    redirect("/appointments/book?error=" + encodeURIComponent("That date or time isn't valid."));
  }
  const endAt = startAt.add({ minutes: appointmentType!.default_duration_minutes });

  const { data: inserted, error } = await supabase
    .schema("scheduling")
    .from("appointments")
    .insert({
      organisation_id: schedulingProfile.organisation_id,
      provider_id: providerId,
      location_id: locationId,
      appointment_type_id: appointmentTypeId,
      start_at: startAt.toInstant().toString(),
      end_at: endAt.toInstant().toString(),
      contact_name: contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      reason_for_booking: reasonForBooking,
      created_by: schedulingProfile.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    // 23P01 = Postgres exclusion_violation — the appointments_no_overlap
    // constraint rejected this because it overlaps an existing booking for
    // the same provider.
    if (error.code === "23P01") {
      redirect(
        "/appointments/book?error=" +
          encodeURIComponent("That time overlaps with an existing appointment for this provider."),
      );
    }
    redirect("/appointments/book?error=" + encodeURIComponent("Could not book that appointment. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "appointment.created",
    tableName: "appointments",
    recordId: inserted?.id ?? null,
    details: { contact_name: contactName, provider_id: providerId, start_at: startAt.toInstant().toString() },
  });

  revalidatePath("/appointments/book");
  revalidatePath("/appointments/calendar");
  redirect("/appointments/book?success=1");
}

// Admin or reception (for their granted providers, enforced by RLS). Soft
// cancel (status + cancelled_at/cancelled_by), never a hard delete —
// appointments are a real clinical/booking record, and cancelling also
// frees the slot for the exclusion constraint (which ignores
// status = 'cancelled' rows).
export async function cancelAppointment(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin" && schedulingProfile.role !== "reception") {
    redirect("/appointments/book?error=" + encodeURIComponent("Only an admin or reception can cancel appointments."));
  }

  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!appointmentId) redirect("/appointments/book");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: schedulingProfile.id,
    })
    .eq("id", appointmentId);

  if (error) {
    console.error(error);
    redirect("/appointments/book?error=" + encodeURIComponent("Could not cancel that appointment. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "appointment.cancelled",
    tableName: "appointments",
    recordId: appointmentId,
  });

  revalidatePath("/appointments/book");
  revalidatePath("/appointments/calendar");
  redirect("/appointments/book");
}

// Admin-only. Adds an existing login (auth.users, shared with the rest of
// this app) as a scheduling.profiles row with a given role — this is what
// actually lets someone into the Appointments tab at all. Deliberately does
// NOT create new accounts or send invite emails; the person needs to already
// have signed in to this app with that email. Looks the account up via a
// SECURITY DEFINER function restricted to service_role (see migration
// scheduling_lookup_auth_user_by_email) since auth.users is never
// PostgREST-exposed, then inserts the profile with the same service-role
// client — profiles_admin_write RLS would also allow a normal admin session
// to do the insert, but the lookup already requires the admin client, so
// this reuses it for both steps rather than opening two separate clients.
export async function createTeamMember(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/team?error=" + encodeURIComponent("Only an admin can add team members."));
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!email || !fullName || (role !== "reception" && role !== "admin")) {
    redirect("/appointments/team?error=" + encodeURIComponent("Please fill in every field with a valid role."));
  }

  const admin = createAdminClient();

  const { data: foundUserId, error: lookupError } = await admin
    .schema("scheduling")
    .rpc("lookup_auth_user_id_by_email", { p_email: email });

  if (lookupError) {
    console.error(lookupError);
    redirect("/appointments/team?error=" + encodeURIComponent("Could not look up that email. Please try again."));
  }

  if (!foundUserId) {
    redirect(
      "/appointments/team?error=" +
        encodeURIComponent(`No account found for ${email} — they need to sign in to the app with that email first, then you can add them here.`),
    );
  }

  const { error: insertError } = await admin
    .schema("scheduling")
    .from("profiles")
    .insert({
      id: foundUserId,
      organisation_id: schedulingProfile.organisation_id,
      full_name: fullName,
      email,
      role,
    });

  if (insertError) {
    console.error(insertError);
    if (insertError.code === "23505") {
      redirect("/appointments/team?error=" + encodeURIComponent("That person already has Appointments access."));
    }
    redirect("/appointments/team?error=" + encodeURIComponent("Could not add that team member. Please try again."));
  }

  // Logged with the normal session client (not the service-role admin
  // client used above) so RLS's audit_events_insert_self policy applies —
  // consistent with every other audit entry in this file.
  const supabase = await createClient();
  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "team_member.added",
    tableName: "profiles",
    recordId: foundUserId,
    details: { email, full_name: fullName, role },
  });

  revalidatePath("/appointments/team");
  redirect("/appointments/team");
}

// Admin-only. Grants (or re-activates) a reception profile's access to one
// provider's appointments — this is what appointments_reception_granted_all
// (the RLS policy on scheduling.appointments) actually checks. Upsert
// because the (profile_id, provider_id) pair may already exist, inactive,
// from a previous revoke.
export async function grantReceptionAccess(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/team?error=" + encodeURIComponent("Only an admin can manage access."));
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();
  if (!profileId || !providerId) redirect("/appointments/team");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("reception_provider_access")
    .upsert(
      { profile_id: profileId, provider_id: providerId, granted_by: schedulingProfile.id, active: true },
      { onConflict: "profile_id,provider_id" },
    );

  if (error) {
    console.error(error);
    redirect("/appointments/team?error=" + encodeURIComponent("Could not grant access. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "reception_access.granted",
    tableName: "reception_provider_access",
    recordId: profileId,
    details: { provider_id: providerId },
  });

  revalidatePath("/appointments/team");
  redirect("/appointments/team");
}

// Admin-only. Revokes a reception profile's access to one provider —
// deactivates rather than deletes so the grant history (who granted it,
// when) is preserved.
export async function revokeReceptionAccess(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/team?error=" + encodeURIComponent("Only an admin can manage access."));
  }

  const profileId = String(formData.get("profile_id") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();
  if (!profileId || !providerId) redirect("/appointments/team");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("scheduling")
    .from("reception_provider_access")
    .update({ active: false })
    .eq("profile_id", profileId)
    .eq("provider_id", providerId);

  if (error) {
    console.error(error);
    redirect("/appointments/team?error=" + encodeURIComponent("Could not revoke access. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "reception_access.revoked",
    tableName: "reception_provider_access",
    recordId: profileId,
    details: { provider_id: providerId },
  });

  revalidatePath("/appointments/team");
  redirect("/appointments/team");
}

// Admin-only, same "not yet exposed to providers themselves" caveat as
// availability rules/overrides (RLS's personal_events_provider_own_write
// is already there for later). A specific, concrete time block on a
// provider's calendar for something that isn't a patient appointment — a
// meeting, CME day, admin time — shown on the calendar the same way a
// booked appointment is, rather than as an availability status change.
export async function createPersonalEvent(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/calendar?error=" + encodeURIComponent("Only an admin can add personal events."));
  }

  const providerId = String(formData.get("provider_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_local_time") ?? "").trim();
  const endTime = String(formData.get("end_local_time") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!providerId || !title || !date || !startTime || !endTime) {
    redirect("/appointments/calendar?error=" + encodeURIComponent("Please fill in every field."));
  }
  if (endTime <= startTime) {
    redirect("/appointments/calendar?error=" + encodeURIComponent("End time must be after start time."));
  }

  const supabase = await createClient();
  const { data: organisation } = await supabase
    .schema("scheduling")
    .from("organisations")
    .select("default_timezone")
    .eq("id", schedulingProfile.organisation_id)
    .maybeSingle();
  const timezone = organisation?.default_timezone ?? "Australia/Sydney";

  let startAt: Temporal.ZonedDateTime;
  let endAt: Temporal.ZonedDateTime;
  try {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const plainDate = Temporal.PlainDate.from(date);
    startAt = plainDate.toZonedDateTime({ timeZone: timezone, plainTime: { hour: startHour, minute: startMinute } });
    endAt = plainDate.toZonedDateTime({ timeZone: timezone, plainTime: { hour: endHour, minute: endMinute } });
  } catch {
    redirect("/appointments/calendar?error=" + encodeURIComponent("That date or time isn't valid."));
  }

  const { data: inserted, error } = await supabase
    .schema("scheduling")
    .from("personal_events")
    .insert({
      provider_id: providerId,
      title,
      start_at: startAt!.toInstant().toString(),
      end_at: endAt!.toInstant().toString(),
      notes,
      created_by: schedulingProfile.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    redirect("/appointments/calendar?error=" + encodeURIComponent("Could not add that event. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "personal_event.created",
    tableName: "personal_events",
    recordId: inserted?.id ?? null,
    details: { provider_id: providerId, title },
  });

  revalidatePath("/appointments/calendar");
  redirect("/appointments/calendar?provider=" + providerId);
}

// Admin-only. Hard delete is fine here — nothing references
// personal_events.id as a foreign key.
export async function deletePersonalEvent(formData: FormData) {
  const schedulingProfile = await getCurrentSchedulingProfile();
  if (!schedulingProfile) redirect("/appointments");
  if (schedulingProfile.role !== "admin") {
    redirect("/appointments/calendar?error=" + encodeURIComponent("Only an admin can remove personal events."));
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const providerId = String(formData.get("provider_id") ?? "").trim();
  if (!eventId) redirect("/appointments/calendar");

  const supabase = await createClient();
  const { error } = await supabase.schema("scheduling").from("personal_events").delete().eq("id", eventId);

  if (error) {
    console.error(error);
    redirect("/appointments/calendar?error=" + encodeURIComponent("Could not remove that event. Please try again."));
  }

  await logAuditEvent(supabase, {
    organisationId: schedulingProfile.organisation_id,
    actorId: schedulingProfile.id,
    action: "personal_event.deleted",
    tableName: "personal_events",
    recordId: eventId,
  });

  revalidatePath("/appointments/calendar");
  redirect(providerId ? "/appointments/calendar?provider=" + providerId : "/appointments/calendar");
}
