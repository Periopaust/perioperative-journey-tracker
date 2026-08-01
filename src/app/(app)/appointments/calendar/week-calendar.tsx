"use client";

import { useNextCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import { createViewDay, createViewWeek, type CalendarEvent } from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";
import "@schedule-x/theme-default/dist/calendar.css";

export type AvailabilityRuleForCalendar = {
  id: string;
  location_id: string;
  // Matches Postgres/JS Date.getDay(): 0 = Sunday .. 6 = Saturday.
  day_of_week: number;
  start_local_time: string; // "HH:MM:SS"
  end_local_time: string; // "HH:MM:SS"
  effective_from: string; // "YYYY-MM-DD"
  effective_until: string | null; // "YYYY-MM-DD" | null
};

export type AppointmentForCalendar = {
  id: string;
  location_id: string;
  appointment_type_id: string;
  start_at: string; // timestamptz ISO string
  end_at: string; // timestamptz ISO string
  contact_name: string;
};

export type AvailabilityOverrideForCalendar = {
  id: string;
  override_date: string; // "YYYY-MM-DD"
  is_available: boolean; // false = blocked/unavailable, true = extra availability
  start_local_time: string | null; // "HH:MM:SS" | null (null = whole day, only valid when !is_available)
  end_local_time: string | null;
  location_id: string | null;
  reason: string | null;
};

export type PersonalEventForCalendar = {
  id: string;
  title: string;
  start_at: string; // timestamptz ISO string
  end_at: string; // timestamptz ISO string
  notes: string | null;
};

function toPlainTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

// Schedule-X uses ISO weekdays (Monday = 1 .. Sunday = 7); our rules store
// Postgres/JS-style day_of_week (Sunday = 0 .. Saturday = 6).
function toIsoWeekday(pgDayOfWeek: number) {
  return pgDayOfWeek === 0 ? 7 : pgDayOfWeek;
}

// Brand teal (see src/app/globals.css --brand-teal) used to make booked
// appointments visually distinct from the lighter default-coloured
// availability blocks they sit on top of. "unavailable"/"extra" give the
// same treatment to one-off availability_overrides rows.
const EVENT_CALENDARS: Record<string, { colorName: string; lightColors: { main: string; container: string; onContainer: string } }> = {
  booked: {
    colorName: "booked",
    lightColors: { main: "#0c6b5c", container: "#ccfbf1", onContainer: "#0c6b5c" },
  },
  // Time off / leave — a one-off availability_overrides row with is_available = false.
  unavailable: {
    colorName: "unavailable",
    lightColors: { main: "#b91c1c", container: "#fee2e2", onContainer: "#991b1b" },
  },
  // A one-off extra session outside normal hours — availability_overrides with is_available = true.
  extra: {
    colorName: "extra",
    lightColors: { main: "#1d4ed8", container: "#dbeafe", onContainer: "#1e40af" },
  },
  // A non-appointment calendar block (meeting, admin time, etc.) — scheduling.personal_events.
  personal: {
    colorName: "personal",
    lightColors: { main: "#7e22ce", container: "#f3e8ff", onContainer: "#6b21a8" },
  },
};

export function AvailabilityWeekCalendar({
  rules,
  appointments,
  overrides,
  personalEvents,
  locationNameById,
  appointmentTypeNameById,
  timezone,
  providerName,
}: {
  rules: AvailabilityRuleForCalendar[];
  appointments: AppointmentForCalendar[];
  overrides?: AvailabilityOverrideForCalendar[];
  personalEvents?: PersonalEventForCalendar[];
  locationNameById: Map<string, string>;
  appointmentTypeNameById: Map<string, string>;
  timezone: string;
  providerName: string;
}) {
  const calendar = useNextCalendarApp({
    views: [createViewWeek(), createViewDay()],
    defaultView: "week",
    timezone,
    isResponsive: true,
    calendars: EVENT_CALENDARS,
    callbacks: {
      // Called on first render and every time the visible range changes
      // (next/prev/today) — recurring weekly rules are expanded into
      // concrete events for whatever range is currently on screen, rather
      // than materialised up front. Booked appointments are already
      // concrete, so they're just filtered to the visible range.
      fetchEvents: async ({ start, end }) => {
        const events: CalendarEvent[] = [];

        // Each item is expanded independently and wrapped in its own
        // try/catch: one malformed rule or appointment (e.g. an
        // unparseable timestamp) should never be able to wipe out every
        // other event on the calendar for the whole visible range. Any
        // failure is logged to the browser console so it's diagnosable
        // instead of just silently rendering a blank grid.
        try {
          let date = start.toPlainDate();
          const endDate = end.toPlainDate();

          while (Temporal.PlainDate.compare(date, endDate) <= 0) {
            const dateStr = date.toString();
            const dayOverrides = (overrides ?? []).filter((o) => o.override_date === dateStr);
            // A whole-day block (no times given) replaces that day's normal
            // hours entirely, rather than just sitting on top of them —
            // otherwise the provider would still show as bookable on a day
            // they're actually on leave.
            const wholeDayUnavailable = dayOverrides.find((o) => !o.is_available && !o.start_local_time);
            const partialUnavailable = dayOverrides.filter(
              (o) => !o.is_available && o.start_local_time && o.end_local_time,
            );
            const extraAvailable = dayOverrides.filter((o) => o.is_available && o.start_local_time && o.end_local_time);

            // Tracks the widest span of hours the whole-day override is
            // actually replacing, so the single "Unavailable" block it
            // produces is sized/positioned like the rule block(s) it stands
            // in for, instead of an arbitrary default.
            let widestUnavailableStart: string | null = null;
            let widestUnavailableEnd: string | null = null;

            for (const rule of rules) {
              try {
                if (toIsoWeekday(rule.day_of_week) !== date.dayOfWeek) continue;
                if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_from)) < 0) continue;
                if (
                  rule.effective_until &&
                  Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_until)) > 0
                ) {
                  continue;
                }

                if (wholeDayUnavailable) {
                  if (!widestUnavailableStart || rule.start_local_time < widestUnavailableStart) {
                    widestUnavailableStart = rule.start_local_time;
                  }
                  if (!widestUnavailableEnd || rule.end_local_time > widestUnavailableEnd) {
                    widestUnavailableEnd = rule.end_local_time;
                  }
                  continue;
                }

                const locationName = locationNameById.get(rule.location_id);

                events.push({
                  id: `${rule.id}_${dateStr}`,
                  start: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(rule.start_local_time) }),
                  end: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(rule.end_local_time) }),
                  title: providerName,
                  location: locationName,
                });
              } catch (ruleError) {
                console.error("[calendar] failed to expand availability rule", rule.id, "for", dateStr, ruleError);
              }
            }

            if (wholeDayUnavailable && widestUnavailableStart && widestUnavailableEnd) {
              try {
                events.push({
                  id: `override_${wholeDayUnavailable.id}_${dateStr}`,
                  start: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(widestUnavailableStart) }),
                  end: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(widestUnavailableEnd) }),
                  title: wholeDayUnavailable.reason ? `Unavailable — ${wholeDayUnavailable.reason}` : "Unavailable",
                  calendarId: "unavailable",
                });
              } catch (overrideError) {
                console.error("[calendar] failed to render unavailable override", wholeDayUnavailable.id, overrideError);
              }
            }

            for (const partial of partialUnavailable) {
              try {
                events.push({
                  id: `override_${partial.id}_${dateStr}`,
                  start: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(partial.start_local_time!) }),
                  end: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(partial.end_local_time!) }),
                  title: partial.reason ? `Unavailable — ${partial.reason}` : "Unavailable",
                  calendarId: "unavailable",
                });
              } catch (overrideError) {
                console.error("[calendar] failed to render unavailable override", partial.id, overrideError);
              }
            }

            for (const extra of extraAvailable) {
              try {
                const locationName = extra.location_id ? locationNameById.get(extra.location_id) : undefined;
                events.push({
                  id: `override_${extra.id}_${dateStr}`,
                  start: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(extra.start_local_time!) }),
                  end: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(extra.end_local_time!) }),
                  title: extra.reason ? `${providerName} (extra) — ${extra.reason}` : `${providerName} (extra)`,
                  location: locationName,
                  calendarId: "extra",
                });
              } catch (overrideError) {
                console.error("[calendar] failed to render extra availability override", extra.id, overrideError);
              }
            }

            date = date.add({ days: 1 });
          }
        } catch (rulesError) {
          console.error("[calendar] failed to expand availability rules", rulesError);
        }

        // Schedule-X's own `start`/`end` range values are ZonedDateTime
        // instances from its own bundled Temporal implementation — not the
        // app's `temporal-polyfill` import. Calling a *static* comparison
        // like `Temporal.ZonedDateTime.compare(ours, theirs)` mixes the two
        // and throws ("Missing timeZone") because our compare() can't read
        // the internal state of a foreign instance. Reading `.epochMilliseconds`
        // — a plain getter each instance evaluates on itself — sidesteps that
        // entirely, so range filtering is done with plain number comparisons.
        const rangeStartMs = start.epochMilliseconds;
        const rangeEndMs = end.epochMilliseconds;

        for (const appointment of appointments) {
          try {
            const appointmentStartInstant = Temporal.Instant.from(appointment.start_at);
            const appointmentEndInstant = Temporal.Instant.from(appointment.end_at);
            if (appointmentEndInstant.epochMilliseconds < rangeStartMs) continue;
            if (appointmentStartInstant.epochMilliseconds > rangeEndMs) continue;

            const appointmentStart = appointmentStartInstant.toZonedDateTimeISO(timezone);
            const appointmentEnd = appointmentEndInstant.toZonedDateTimeISO(timezone);

            const typeName = appointmentTypeNameById.get(appointment.appointment_type_id);
            const locationName = locationNameById.get(appointment.location_id);

            events.push({
              id: `appointment_${appointment.id}`,
              start: appointmentStart,
              end: appointmentEnd,
              title: typeName ? `${appointment.contact_name} — ${typeName}` : appointment.contact_name,
              location: locationName,
              calendarId: "booked",
            });
          } catch (appointmentError) {
            console.error("[calendar] failed to render appointment", appointment.id, appointmentError);
          }
        }

        for (const personalEvent of personalEvents ?? []) {
          try {
            const eventStartInstant = Temporal.Instant.from(personalEvent.start_at);
            const eventEndInstant = Temporal.Instant.from(personalEvent.end_at);
            if (eventEndInstant.epochMilliseconds < rangeStartMs) continue;
            if (eventStartInstant.epochMilliseconds > rangeEndMs) continue;

            events.push({
              id: `personal_${personalEvent.id}`,
              start: eventStartInstant.toZonedDateTimeISO(timezone),
              end: eventEndInstant.toZonedDateTimeISO(timezone),
              title: personalEvent.notes ? `${personalEvent.title} — ${personalEvent.notes}` : personalEvent.title,
              calendarId: "personal",
            });
          } catch (personalEventError) {
            console.error("[calendar] failed to render personal event", personalEvent.id, personalEventError);
          }
        }

        console.log(`[calendar] fetchEvents ${start.toString()} – ${end.toString()}: ${events.length} events (rules=${rules.length}, appointments=${appointments.length}, overrides=${(overrides ?? []).length}, personalEvents=${(personalEvents ?? []).length})`);

        return events;
      },
    },
  });

  if (!calendar) {
    return <p className="text-sm text-gray-500 px-2 py-4">Loading calendar…</p>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2">
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}
