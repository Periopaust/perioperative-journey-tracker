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

function toPlainTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

// Schedule-X uses ISO weekdays (Monday = 1 .. Sunday = 7); our rules store
// Postgres/JS-style day_of_week (Sunday = 0 .. Saturday = 6).
function toIsoWeekday(pgDayOfWeek: number) {
  return pgDayOfWeek === 0 ? 7 : pgDayOfWeek;
}

export function AvailabilityWeekCalendar({
  rules,
  locationNameById,
  timezone,
  providerName,
}: {
  rules: AvailabilityRuleForCalendar[];
  locationNameById: Map<string, string>;
  timezone: string;
  providerName: string;
}) {
  const calendar = useNextCalendarApp({
    views: [createViewWeek(), createViewDay()],
    defaultView: "week",
    timezone,
    isResponsive: true,
    callbacks: {
      // Called on first render and every time the visible range changes
      // (next/prev/today) — recurring weekly rules are expanded into
      // concrete events for whatever range is currently on screen, rather
      // than materialised up front.
      fetchEvents: async ({ start, end }) => {
        const events: CalendarEvent[] = [];
        let date = start.toPlainDate();
        const endDate = end.toPlainDate();

        while (Temporal.PlainDate.compare(date, endDate) <= 0) {
          for (const rule of rules) {
            if (toIsoWeekday(rule.day_of_week) !== date.dayOfWeek) continue;
            if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_from)) < 0) continue;
            if (
              rule.effective_until &&
              Temporal.PlainDate.compare(date, Temporal.PlainDate.from(rule.effective_until)) > 0
            ) {
              continue;
            }

            const locationName = locationNameById.get(rule.location_id);

            events.push({
              id: `${rule.id}_${date.toString()}`,
              start: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(rule.start_local_time) }),
              end: date.toZonedDateTime({ timeZone: timezone, plainTime: toPlainTime(rule.end_local_time) }),
              title: providerName,
              location: locationName,
            });
          }
          date = date.add({ days: 1 });
        }

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
