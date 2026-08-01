"use client";

import { useState, useRef, useEffect } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type BookingConfirmation = {
  confirmed: boolean;
  startAt: string;
  endAt: string;
  status: string;
  locationName: string;
};

const MAX_MESSAGES = 40;

export function AssistantChat({ practiceName, greeting }: { practiceName: string; greeting: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const atMessageLimit = messages.length >= MAX_MESSAGES;

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || atMessageLimit || booking?.confirmed) return;

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/public-booking/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (typeof data.reply !== "string") throw new Error("Unexpected response");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.booking) setBooking(data.booking);
    } catch {
      setError("Sorry, that didn't go through — please try again, or call the practice directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white flex flex-col h-[70vh] max-h-[640px]">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{practiceName} — booking assistant</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((message, i) => (
          <div key={i} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                message.role === "user" ? "bg-brand-teal text-white" : "bg-gray-100 text-gray-800"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-400">…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}

      {booking?.confirmed && (
        <p className="px-4 pb-3 text-xs text-emerald-700 bg-emerald-50 mx-4 mb-3 rounded-md py-2">
          Booking confirmed at {booking.locationName}. If you need to change or cancel it, please call the practice.
        </p>
      )}

      {atMessageLimit && !booking && (
        <p className="px-4 pb-3 text-xs text-amber-700 bg-amber-50 mx-4 mb-3 rounded-md py-2">
          This conversation has gone on a while — please call the practice directly to finish booking.
        </p>
      )}

      <form onSubmit={sendMessage} className="border-t border-gray-100 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending || atMessageLimit || booking?.confirmed}
          placeholder={booking?.confirmed ? "Booking complete" : "Type a message…"}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={sending || atMessageLimit || booking?.confirmed || !input.trim()}
          className="rounded-md bg-brand-teal text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
