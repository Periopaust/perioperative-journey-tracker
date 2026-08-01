import { Temporal } from "temporal-polyfill";
import { createAdminClient } from "@/lib/supabase/admin";

// Core logic behind the public AI booking assistant (/book, backed by
// src/app/api/public-booking/chat/route.ts). Everything in this file runs
// with the Supabase SERVICE ROLE key (via createAdminClient()) because the
// person on the other end has no session at all — there is no RLS policy
// that could safely grant an anonymous visitor row-level access to
// scheduling.appointments (and there shouldn't be one; RLS on that table
// stays exactly as staff-only as it already is). Every function below is
// the entire trust boundary for that anonymous visitor, so each one
// re-derives everything it needs from the database rather than trusting
// anything the caller passes in beyond IDs and the patient's own contact
// details.
//
// Nothing here ever touches clinical/journey data — only the `scheduling`
// schema, which is already isolated from the rest of the app.

const MAX_SLOTS_RETURNED = 12;
const MAX_DAYS_SCANNED = 60;
const MAX_BOOKINGS_PER_CONTACT_PER_DAY = 3;

export type PublicOrganisationContext = {
  id: string;
  name: string;
  default_timezone: string;
};

export type PublicAppointmentType = {
  id: string;
  name: string;
  description: string | null;
  default_duration_minutes: number;
  booking_mode: string;
  requires_manual_confirmation: boolean;
};

export type PublicProvider = {
  id: string;
  display_name: string;
  provider_type: string | null;
};

export type PublicSlot = {
  start_at: string; // instant ISO string
  end_at: string; // instant ISO string
  location_id: string;
  location_name: string;
};

// Resolves the practice this booking page is for. Single-tenant today (one
// active organisation) but written so a future multi-practice deployment
// only needs this one function to change.
export async function getPublicOrganisationContext(): Promise<PublicOrganisationContext | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("scheduling")
    .from("organisations")
    .select("id, name, default_timezone")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicOrganisationContext;
}

// Only appointment types an admin has explicitly opted in (ai_bookable =
// true) are ever offered here — see the scheduling_appointment_types_ai_bookable
// migration. Everything else in the practice stays staff-booking-only.
export async function listBookableAppointmentTypes(organisationId: string): Promise<PublicAppointmentType[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("scheduling")
    .from("appointment_types")
    .select("id, name, description, default_duration_minutes, booking_mode, requires_manual_confirmation")
    .eq("organisation_id", organisationId)
    .eq("active", true)
    .eq("ai_bookable", true)
    .order("name");

  if (error) {
    console.error("[public-booking] failed to list bookable appointment types", error);
    return [];
  }
  return (data ?? []) as PublicAppointmentType[];
}

export async function listBookableProviders(organisationId: string): Promise<PublicProvider[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("scheduling")
    .from("providers")
    .select("id, display_name, provider_type")
    .eq("organisation_id", organisationId)
    .eq("active", true)
    .order("display_name");

  if (error) {
    console.error("[public-booking] failed to list providers", error);
    return [];
  }
  return (data ?? []) as PublicProvider[];
}

type ProviderRow = {
  id: string;
  organisation_id: string;
  default_location_id: string | null;
  slot_interval_minutes: number;
  minimum_booking_notice_minutes: number;
  maximum_booking_horizon_days: number;
  active: boolean;
};

async function resolveLocationForProvider(
  organisationId: string,
  provider: ProviderRow,
): Promise<{ id: string; name: string } | null> {
  const supabase = createAdminClient();

  if (provider.default_location_id) {
    const { data } = await supabase
      .schema("scheduling")
      .from("locations")
      .select("id, name")
      .eq("id", provider.default_location_id)
      .eq("active", true)
      .maybeSingle();
    if (data) return data;
  }

  // No default set on the provider — fall back to the practice's only
  // active location if there's exactly one. If there's more than one, the
  // caller (the assistant) needs to ask the patient which one; returning
  // null here signals "can't resolve automatically" rather than guessing.
  const { data: locations } = await supabase
    .schema("scheduling")
    .from("locations")
    .select("id, name")
    .eq("organisation_id", organisationId)
    .eq("active", true);

  if (locations && locations.length === 1) return locations[0];
  return null;
}

// Turns [{start,end}, ...] minute-of-day ranges (may overlap) into a
// sorted, non-overlapping set.
function mergeMinuteRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

// Subtracts `busy` minute-of-day ranges from `free` minute-of-day ranges.
function subtractMinuteRanges(free: [number, number][], busy: [number, number][]): [number, number][] {
  let result = mergeMinuteRanges(free);
  for (const [busyStart, busyEnd] of busy) {
    const next: [number, number][] = [];
    for (const [freeStart, freeEnd] of result) {
      if (busyEnd <= freeStart || busyStart >= freeEnd) {
        next.push([freeStart, freeEnd]);
        continue;
      }
      if (busyStart > freeStart) next.push([freeStart, Math.min(busyStart, freeEnd)]);
      if (busyEnd < freeEnd) next.push([Math.max(busyEnd, freeStart), freeEnd]);
    }
    result = next.filter(([s, e]) => e > s);
  }
  return result;
}

function localTimeToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(":");
  return Number(hourStr) * 60 + Number(minuteStr);
}

// Clips an instant range to the given local calendar day (in `timezone`)
// and returns it as minutes-since-midnight-that-day, or null if the range
// doesn't touch that day at all.
function clipToDayMinutes(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  dayStart: Temporal.ZonedDateTime,
  dayEnd: Temporal.ZonedDateTime,
): [number, number] | null {
  const clippedStartMs = Math.max(startInstant.epochMilliseconds, dayStart.epochMilliseconds);
  const clippedEndMs = Math.min(endInstant.epochMilliseconds, dayEnd.epochMilliseconds);
  if (clippedEndMs <= clippedStartMs) return null;
  const startMinutes = (clippedStartMs - dayStart.epochMilliseconds) / 60_000;
  const endMinutes = (clippedEndMs - dayStart.epochMilliseconds) / 60_000;
  return [startMinutes, endMinutes];
}

// The heart of the public booking flow: works out real, currently-free
// slots for a provider/appointment-type combination, using exactly the
// same inputs (availability_rules, availability_overrides, personal_events,
// non-cancelled appointments) the internal staff calendar renders from —
// just turned into discrete bookable start times instead of visual blocks.
//
// A whole-day "unavailable" override blanks the entire day (matches the
// internal calendar's treatment of leave days) — any same-day "extra
// availability" override is deliberately NOT re-added on top of that here.
// The internal calendar will still show it as a distinct edge case; this
// function is intentionally more conservative, since erring toward "ask
// the practice to call" is the safer failure mode for an unattended public
// booking flow than a false positive.
export async function computeAvailableSlots(params: {
  organisationId: string;
  providerId: string;
  appointmentTypeId: string;
  timezone: string;
  fromDate?: Temporal.PlainDate;
  maxSlots?: number;
  maxDaysToScan?: number;
}): Promise<PublicSlot[]> {
  const supabase = createAdminClient();
  const maxSlots = params.maxSlots ?? MAX_SLOTS_RETURNED;
  const maxDaysToScan = params.maxDaysToScan ?? MAX_DAYS_SCANNED;

  const [{ data: provider }, { data: appointmentType }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("providers")
      .select(
        "id, organisation_id, default_location_id, slot_interval_minutes, minimum_booking_notice_minutes, maximum_booking_horizon_days, active",
      )
      .eq("id", params.providerId)
      .eq("organisation_id", params.organisationId)
      .maybeSingle(),
    supabase
      .schema("scheduling")
      .from("appointment_types")
      .select("id, organisation_id, default_duration_minutes, active, ai_bookable, requires_manual_confirmation")
      .eq("id", params.appointmentTypeId)
      .eq("organisation_id", params.organisationId)
      .maybeSingle(),
  ]);

  if (!provider || !provider.active) return [];
  if (!appointmentType || !appointmentType.active || !appointmentType.ai_bookable) return [];

  const location = await resolveLocationForProvider(params.organisationId, provider as ProviderRow);
  if (!location) return [];

  const nowInstant = Temporal.Now.instant();
  const earliestBookableMs = nowInstant.epochMilliseconds + (provider.minimum_booking_notice_minutes ?? 0) * 60_000;

  const today = params.fromDate ?? Temporal.Now.zonedDateTimeISO(params.timezone).toPlainDate();
  const horizonDate = Temporal.Now.zonedDateTimeISO(params.timezone)
    .toPlainDate()
    .add({ days: provider.maximum_booking_horizon_days ?? 90 });

  const [{ data: rules }, { data: overrides }, { data: personalEvents }, { data: appointments }] = await Promise.all([
    supabase
      .schema("scheduling")
      .from("availability_rules")
      .select("day_of_week, start_local_time, end_local_time, effective_from, effective_until")
      .eq("provider_id", params.providerId)
      .eq("active", true),
    supabase
      .schema("scheduling")
      .from("availability_overrides")
      .select("override_date, is_available, start_local_time, end_local_time")
      .eq("provider_id", params.providerId)
      .gte("override_date", today.toString())
      .lte("override_date", horizonDate.toString()),
    supabase
      .schema("scheduling")
      .from("personal_events")
      .select("start_at, end_at")
      .eq("provider_id", params.providerId)
      .gte("end_at", nowInstant.toString()),
    supabase
      .schema("scheduling")
      .from("appointments")
      .select("start_at, end_at")
      .eq("provider_id", params.providerId)
      .neq("status", "cancelled")
      .gte("end_at", nowInstant.toString()),
  ]);

  const duration = appointmentType.default_duration_minutes;
  const slotInterval = provider.slot_interval_minutes ?? 30;
  const results: PublicSlot[] = [];

  let date = today;
  let daysScanned = 0;

  while (
    results.length < maxSlots &&
    daysScanned < maxDaysToScan &&
    Temporal.PlainDate.compare(date, horizonDate) <= 0
  ) {
    daysScanned += 1;
    const dateStr = date.toString();

    const dayOverrides = (overrides ?? []).filter((o) => o.override_date === dateStr);
    const wholeDayUnavailable = dayOverrides.some((o) => !o.is_available && !o.start_local_time);

    if (!wholeDayUnavailable) {
      const ruleWindows: [number, number][] = (rules ?? [])
        .filter((rule) => {
          const isoWeekday = rule.day_of_week === 0 ? 7 : rule.day_of_week;
          if (isoWeekday !== date.dayOfWeek) return false;
          if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_from)) < 0) return false;
          if (rule.effective_until && Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_until)) > 0) {
            return false;
          }
          return true;
        })
        .map((rule) => [localTimeToMinutes(rule.start_local_time), localTimeToMinutes(rule.end_local_time)]);

      const extraWindows: [number, number][] = dayOverrides
        .filter((o) => o.is_available && o.start_local_time && o.end_local_time)
        .map((o) => [localTimeToMinutes(o.start_local_time!), localTimeToMinutes(o.end_local_time!)]);

      const partialUnavailable: [number, number][] = dayOverrides
        .filter((o) => !o.is_available && o.start_local_time && o.end_local_time)
        .map((o) => [localTimeToMinutes(o.start_local_time!), localTimeToMinutes(o.end_local_time!)]);

      let freeWindows = mergeMinuteRanges([...ruleWindows, ...extraWindows]);
      freeWindows = subtractMinuteRanges(freeWindows, partialUnavailable);

      if (freeWindows.length > 0) {
        const dayStart = date.toZonedDateTime({ timeZone: params.timezone, plainTime: { hour: 0, minute: 0 } });
        const dayEnd = dayStart.add({ days: 1 });

        const busyRanges: [number, number][] = [];
        for (const list of [appointments ?? [], personalEvents ?? []]) {
          for (const item of list) {
            try {
              const clipped = clipToDayMinutes(
                Temporal.Instant.from(item.start_at),
                Temporal.Instant.from(item.end_at),
                dayStart,
                dayEnd,
              );
              if (clipped) busyRanges.push(clipped);
            } catch (err) {
              console.error("[public-booking] failed to clip busy range", err);
            }
          }
        }

        freeWindows = subtractMinuteRanges(freeWindows, busyRanges);

        for (const [windowStart, windowEnd] of freeWindows) {
          // Align candidate slot starts to a fixed midnight-based grid
          // (e.g. :00/:30) rather than to the window's own start, so times
          // look like the ones a receptionist would offer over the phone.
          let slotStartMinute = Math.ceil(windowStart / slotInterval) * slotInterval;
          while (slotStartMinute + duration <= windowEnd) {
            const slotStart = dayStart.add({ minutes: slotStartMinute });
            if (slotStart.epochMilliseconds >= earliestBookableMs) {
              const slotEnd = slotStart.add({ minutes: duration });
              results.push({
                start_at: slotStart.toInstant().toString(),
                end_at: slotEnd.toInstant().toString(),
                location_id: location.id,
                location_name: location.name,
              });
              if (results.length >= maxSlots) break;
            }
            slotStartMinute += slotInterval;
          }
        }
      }
    }

    date = date.add({ days: 1 });
  }

  return results;
}

export type CreatePublicBookingInput = {
  organisationId: string;
  providerId: string;
  appointmentTypeId: string;
  startAtIso: string; // must exactly match a slot start this function itself computes as free
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  reasonForBooking: string | null;
  timezone: string;
};

export type CreatePublicBookingResult =
  | { ok: true; appointmentId: string; startAtIso: string; endAtIso: string; status: string; locationName: string }
  | { ok: false; reason: "invalid_input" | "slot_no_longer_available" | "rate_limited" | "db_error" };

// The single write path for the public assistant. Re-derives everything —
// never trusts a start time, duration, or location the caller supplies
// beyond using it to look up a match — so a hallucinated or tampered
// request can only ever fail closed, never book something the practice's
// own rules wouldn't have offered.
export async function createPublicBooking(input: CreatePublicBookingInput): Promise<CreatePublicBookingResult> {
  if (!input.contactName.trim() || (!input.contactPhone && !input.contactEmail)) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = createAdminClient();

  let requestedInstant: Temporal.Instant;
  try {
    requestedInstant = Temporal.Instant.from(input.startAtIso);
  } catch {
    return { ok: false, reason: "invalid_input" };
  }

  // Rate limit is checked against the practice's own appointment records —
  // no separate table needed. Scoped to the last 24h per contact so a
  // script (or a confused conversation looping on itself) can't fill the
  // calendar with junk tentative bookings.
  const since = Temporal.Now.instant().subtract({ hours: 24 }).toString();
  const contactFilters = [
    input.contactEmail ? `contact_email.eq.${input.contactEmail}` : null,
    input.contactPhone ? `contact_phone.eq.${input.contactPhone}` : null,
  ].filter(Boolean) as string[];

  if (contactFilters.length > 0) {
    const { count } = await supabase
      .schema("scheduling")
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", input.organisationId)
      .eq("source", "ai_secretary")
      .gte("created_at", since)
      .or(contactFilters.join(","));

    if ((count ?? 0) >= MAX_BOOKINGS_PER_CONTACT_PER_DAY) {
      return { ok: false, reason: "rate_limited" };
    }
  }

  const requestedDate = requestedInstant.toZonedDateTimeISO(input.timezone).toPlainDate();

  // Re-run the exact same availability computation for just that one day
  // and confirm the requested start is genuinely one of the free slots it
  // produces. This is what actually stops an out-of-hours or conflicting
  // booking from ever reaching the insert — the database's exclusion
  // constraint below is a second, independent backstop against a race
  // between two concurrent bookings, not the primary check.
  const daySlots = await computeAvailableSlots({
    organisationId: input.organisationId,
    providerId: input.providerId,
    appointmentTypeId: input.appointmentTypeId,
    timezone: input.timezone,
    fromDate: requestedDate,
    maxDaysToScan: 1,
    maxSlots: 200,
  });

  const matchedSlot = daySlots.find((slot) => slot.start_at === requestedInstant.toString());
  if (!matchedSlot) {
    return { ok: false, reason: "slot_no_longer_available" };
  }

  const { data: appointmentType } = await supabase
    .schema("scheduling")
    .from("appointment_types")
    .select("requires_manual_confirmation")
    .eq("id", input.appointmentTypeId)
    .maybeSingle();

  const status = appointmentType?.requires_manual_confirmation ? "tentative" : "confirmed";

  const { data: inserted, error } = await supabase
    .schema("scheduling")
    .from("appointments")
    .insert({
      organisation_id: input.organisationId,
      provider_id: input.providerId,
      location_id: matchedSlot.location_id,
      appointment_type_id: input.appointmentTypeId,
      start_at: matchedSlot.start_at,
      end_at: matchedSlot.end_at,
      status,
      source: "ai_secretary",
      contact_name: input.contactName.trim(),
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail,
      reason_for_booking: input.reasonForBooking,
      created_by: null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[public-booking] insert failed", error);
    // 23P01 = Postgres exclusion_violation (appointments_no_overlap) — two
    // concurrent bookings landed on the same slot; the earlier availability
    // check above is what normally prevents this, this is the backstop.
    if (error?.code === "23P01") {
      return { ok: false, reason: "slot_no_longer_available" };
    }
    return { ok: false, reason: "db_error" };
  }

  const { error: auditError } = await supabase.schema("scheduling").from("audit_events").insert({
    organisation_id: input.organisationId,
    actor_id: null,
    action: "appointment.created",
    table_name: "appointments",
    record_id: inserted.id,
    details: { source: "ai_secretary", contact_name: input.contactName.trim(), start_at: matchedSlot.start_at },
  });
  if (auditError) console.error("[public-booking] failed to log audit event", auditError);

  return {
    ok: true,
    appointmentId: inserted.id,
    startAtIso: matchedSlot.start_at,
    endAtIso: matchedSlot.end_at,
    status,
    locationName: matchedSlot.location_name,
  };
}
