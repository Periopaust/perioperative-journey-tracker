import OpenAI from "openai";
import {
  getPublicOrganisationContext,
  listBookableAppointmentTypes,
  listBookableProviders,
  computeAvailableSlots,
  createPublicBooking,
  type PublicSlot,
} from "@/lib/scheduling/public-booking";

// Server-side chat turn handler for the public AI booking assistant
// (/book). Nothing here is reachable without the matching exception in
// middleware.ts — see the comment there. The Azure OpenAI credentials
// (same AZURE_OPENAI_* env vars already used elsewhere in this app) are
// only ever read here, server-side; the browser never sees them.
//
// The assistant is deliberately NOT given free-form database access or
// native "function calling" against arbitrary tools. Each turn, the model
// must respond with exactly one JSON object describing one of three
// things it's allowed to do (see SYSTEM_PROMPT below): talk, check real
// availability, or book. All three are backed by src/lib/scheduling/
// public-booking.ts, which re-validates everything server-side regardless
// of what the model asked for — a hallucinated or tampered request can
// only fail closed.

const MAX_CLIENT_MESSAGES = 40; // ~20 back-and-forths before we ask them to call the practice
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ROUNDTRIPS = 4;

type ClientMessage = { role: "user" | "assistant"; content: string };

function getAzureOpenAIClient() {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!azureApiKey || !azureEndpoint) {
    throw new Error("Azure OpenAI API key or endpoint is missing.");
  }
  return new OpenAI({ apiKey: azureApiKey, baseURL: `${azureEndpoint}/openai/v1` });
}

function formatSlotLabel(slot: PublicSlot, timezone: string) {
  const start = new Date(slot.start_at);
  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)}`;
}

function validateMessages(body: unknown): ClientMessage[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { messages?: unknown }).messages)) return null;
  const messages = (body as { messages: unknown[] }).messages;
  if (messages.length === 0 || messages.length > MAX_CLIENT_MESSAGES) return null;

  const cleaned: ClientMessage[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") return null;
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return null;
    cleaned.push({ role, content });
  }
  if (cleaned[cleaned.length - 1].role !== "user") return null;
  return cleaned;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const clientMessages = validateMessages(body);
  if (!clientMessages) {
    return Response.json(
      { reply: "This conversation has gone on a while — please call the practice directly to finish booking." },
      { status: 200 },
    );
  }

  const org = await getPublicOrganisationContext();
  if (!org) {
    return Response.json(
      { reply: "Online booking isn't available right now — please call the practice directly." },
      { status: 200 },
    );
  }

  const [appointmentTypes, providers] = await Promise.all([
    listBookableAppointmentTypes(org.id),
    listBookableProviders(org.id),
  ]);

  if (appointmentTypes.length === 0 || providers.length === 0) {
    return Response.json(
      { reply: "Online booking isn't set up for anything yet — please call the practice directly to book." },
      { status: 200 },
    );
  }

  let openai: OpenAI;
  try {
    openai = getAzureOpenAIClient();
  } catch (err) {
    console.error("[public-booking/chat] Azure OpenAI client unavailable", err);
    return Response.json(
      { reply: "The booking assistant is temporarily unavailable — please call the practice directly." },
      { status: 200 },
    );
  }

  const todayLabel = new Intl.DateTimeFormat("en-AU", {
    timeZone: org.default_timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const systemPrompt = `You are the online booking assistant for ${org.name}, an Australian healthcare practice. You help patients find and book an appointment for themselves. Today is ${todayLabel} (practice timezone: ${org.default_timezone}).

BOOKABLE APPOINTMENT TYPES (only ever offer these — never invent others):
${appointmentTypes
  .map((t) => `- id: ${t.id} | "${t.name}" (${t.default_duration_minutes} min)${t.description ? ` — ${t.description}` : ""}${t.requires_manual_confirmation ? " [practice will confirm this one before it's final]" : ""}`)
  .join("\n")}

PROVIDERS (only ever offer these — never invent others):
${providers.map((p) => `- id: ${p.id} | ${p.display_name}${p.provider_type ? ` (${p.provider_type})` : ""}`).join("\n")}

RULES:
1. You may only talk about booking, rescheduling context, or availability at this practice. If asked anything clinical, or anything unrelated to booking, politely decline and suggest they call the practice or discuss it with their provider at the appointment.
2. Never invent or guess an available time. The only times you may offer are ones returned by a "check_availability" step you triggered — copy the exact start time given.
3. Before booking, always show the patient a short plain-English summary (appointment type, provider, date/time) and get an explicit yes/confirm from them. Never book on an ambiguous or implied confirmation.
4. You need the patient's name and at least one contact method (phone or email) before you can book. Ask for whichever is missing.
5. Keep messages short, warm, and in Australian English. No medical jargon.
6. Every reply you produce must be a single JSON object — nothing else, no markdown — of exactly one of these shapes:
   {"type":"message","text":"..."}
   {"type":"check_availability","appointment_type_id":"...","provider_id":"..."}
   {"type":"book_appointment","appointment_type_id":"...","provider_id":"...","start_at":"...","contact_name":"...","contact_phone":null,"contact_email":null,"reason_for_booking":null}
   "start_at" in book_appointment must be copied verbatim from a start_at value you were given in a prior check_availability result.`;

  const modelMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...clientMessages.map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? JSON.stringify({ type: "message", text: m.content }) : m.content,
    })),
  ];

  for (let roundtrip = 0; roundtrip < MAX_TOOL_ROUNDTRIPS; roundtrip++) {
    let raw: string;
    try {
      const response = await openai.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT!,
        messages: modelMessages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      raw = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[public-booking/chat] Azure OpenAI call failed", err);
      return Response.json(
        { reply: "Sorry, something went wrong on our end — please try again or call the practice." },
        { status: 200 },
      );
    }

    let action: Record<string, unknown>;
    try {
      action = JSON.parse(raw);
    } catch {
      console.error("[public-booking/chat] model returned non-JSON", raw);
      return Response.json(
        { reply: "Sorry, could you rephrase that? I didn't quite follow." },
        { status: 200 },
      );
    }

    if (action.type === "message" && typeof action.text === "string") {
      return Response.json({ reply: action.text });
    }

    if (action.type === "check_availability") {
      const appointmentTypeId = String(action.appointment_type_id ?? "");
      const providerId = String(action.provider_id ?? "");
      const validType = appointmentTypes.some((t) => t.id === appointmentTypeId);
      const validProvider = providers.some((p) => p.id === providerId);

      let toolResult: unknown;
      if (!validType || !validProvider) {
        toolResult = { error: "Unknown appointment type or provider — only use the ids listed in your instructions." };
      } else {
        const slots = await computeAvailableSlots({
          organisationId: org.id,
          providerId,
          appointmentTypeId,
          timezone: org.default_timezone,
        });
        toolResult = {
          slots: slots.map((s) => ({ start_at: s.start_at, label: formatSlotLabel(s, org.default_timezone), location: s.location_name })),
        };
      }

      modelMessages.push({ role: "assistant", content: JSON.stringify(action) });
      modelMessages.push({ role: "user", content: `TOOL_RESULT check_availability: ${JSON.stringify(toolResult)}` });
      continue;
    }

    if (action.type === "book_appointment") {
      const appointmentTypeId = String(action.appointment_type_id ?? "");
      const providerId = String(action.provider_id ?? "");
      const startAt = typeof action.start_at === "string" ? action.start_at : "";
      const contactName = typeof action.contact_name === "string" ? action.contact_name : "";
      const contactPhone = typeof action.contact_phone === "string" && action.contact_phone.trim() ? action.contact_phone.trim() : null;
      const contactEmail = typeof action.contact_email === "string" && action.contact_email.trim() ? action.contact_email.trim() : null;
      const reasonForBooking =
        typeof action.reason_for_booking === "string" && action.reason_for_booking.trim() ? action.reason_for_booking.trim() : null;

      const validType = appointmentTypes.some((t) => t.id === appointmentTypeId);
      const validProvider = providers.some((p) => p.id === providerId);
      if (!validType || !validProvider || !startAt) {
        return Response.json({ reply: "Sorry, something about that booking didn't line up — could we try again?" });
      }

      const result = await createPublicBooking({
        organisationId: org.id,
        providerId,
        appointmentTypeId,
        startAtIso: startAt,
        contactName,
        contactPhone,
        contactEmail,
        reasonForBooking,
        timezone: org.default_timezone,
      });

      const providerName = providers.find((p) => p.id === providerId)?.display_name ?? "your provider";
      const typeName = appointmentTypes.find((t) => t.id === appointmentTypeId)?.name ?? "your appointment";

      if (result.ok) {
        const whenLabel = new Intl.DateTimeFormat("en-AU", {
          timeZone: org.default_timezone,
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(result.startAtIso));

        const reply =
          result.status === "confirmed"
            ? `You're all booked in — ${typeName} with ${providerName} at ${result.locationName} on ${whenLabel}. Looking forward to seeing you!`
            : `Thanks — I've tentatively booked ${typeName} with ${providerName} at ${result.locationName} on ${whenLabel}. The practice will confirm this with you shortly.`;

        return Response.json({
          reply,
          booking: { confirmed: result.status === "confirmed", startAt: result.startAtIso, endAt: result.endAtIso, status: result.status, locationName: result.locationName },
        });
      }

      const failureReply =
        result.reason === "rate_limited"
          ? "It looks like a few bookings have already gone through for these contact details today — please call the practice directly to book any more."
          : result.reason === "invalid_input"
            ? "I still need your name and either a phone number or an email to finish booking — could you send those through?"
            : "That time's just been taken by someone else — let's find you another slot.";

      return Response.json({ reply: failureReply });
    }

    // Unrecognised action shape — treat as a conversational miss rather
    // than erroring the whole request.
    return Response.json({ reply: "Sorry, could you rephrase that? I didn't quite follow." });
  }

  return Response.json({
    reply: "I'm having trouble pinning that down — please call the practice directly and they can sort it out for you.",
  });
}
