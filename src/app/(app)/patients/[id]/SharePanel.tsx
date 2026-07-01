"use client";

import { useState, useTransition } from "react";
import { Users, X, Send, Lock } from "lucide-react";
import { sharePatient, removeShare, type ShareRecord } from "@/app/actions/sharing";

export default function SharePanel({
  patientId,
  isOwner,
  shares,
}: {
  patientId: string;
  isOwner: boolean;
  shares: ShareRecord[];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await sharePatient(patientId, email);
      if (result.error) {
        setError(result.error);
      } else {
        setEmail("");
        setSuccess(`Access granted.`);
      }
    });
  }

  function handleRemove(shareId: string) {
    startTransition(async () => {
      await removeShare(shareId, patientId);
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-slate-700 border border-gray-200 rounded px-2.5 py-1.5 hover:bg-gray-50"
      >
        <Users className="h-3.5 w-3.5" />
        Share
        {shares.length > 0 && (
          <span className="bg-brand-teal text-white rounded-full text-[10px] px-1.5 font-semibold">
            {shares.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-teal" />
              Clinical access
            </h3>
            <button onClick={() => setOpen(false)}>
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            <Lock className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Shared clinicians can view and add letters and clinical notes. Billing data is never shared.</span>
          </div>

          {/* Current shares */}
          {shares.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Has access</p>
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-slate-700">{s.profile?.full_name ?? "Unknown"}</p>
                    <p className="text-[10px] text-gray-400">{s.profile?.email}</p>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRemove(s.id)}
                      disabled={pending}
                      className="text-gray-300 hover:text-rose-500 transition"
                      title="Remove access"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {shares.length === 0 && (
            <p className="text-xs text-gray-400">No one else has access to this patient yet.</p>
          )}

          {/* Add share — owner only */}
          {isOwner && (
            <form onSubmit={handleShare} className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Add clinician</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@email.com"
                  required
                  className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal/50"
                />
                <button
                  type="submit"
                  disabled={pending || !email}
                  className="flex items-center gap-1 bg-brand-teal text-white text-xs px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  Grant
                </button>
              </div>
              {error && <p className="text-xs text-rose-500">{error}</p>}
              {success && <p className="text-xs text-emerald-600">{success}</p>}
              <p className="text-[10px] text-gray-400">
                The clinician must have logged into the app at least once.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
