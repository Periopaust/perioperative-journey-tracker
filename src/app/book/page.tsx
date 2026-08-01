import { getPublicOrganisationContext, listBookableAppointmentTypes, listBookableProviders } from "@/lib/scheduling/public-booking";
import { AssistantChat } from "./assistant-chat";

// Public, unauthenticated page — see the exception carved out for /book in
// middleware.ts. Deliberately outside the (app) route group so it gets the
// bare root layout (no staff navigation, no assumption of a logged-in
// session).
export default async function PublicBookingPage() {
  const org = await getPublicOrganisationContext();
  const [appointmentTypes, providers] = org
    ? await Promise.all([listBookableAppointmentTypes(org.id), listBookableProviders(org.id)])
    : [[], []];

  const bookingAvailable = !!org && appointmentTypes.length > 0 && providers.length > 0;

  return (
    <div className="min-h-full bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">
            {org?.name ?? "Book an appointment"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {bookingAvailable
              ? "Chat with our booking assistant to find a time that suits you."
              : "Online booking isn't available right now — please call the practice directly."}
          </p>
        </div>

        {bookingAvailable && org && (
          <AssistantChat
            practiceName={org.name}
            greeting={`Hi, I'm ${org.name}'s booking assistant. What kind of appointment can I help you book today?`}
          />
        )}
      </div>
    </div>
  );
}
