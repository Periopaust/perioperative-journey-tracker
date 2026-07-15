"use client";

import { useEffect, useState } from "react";
import { getUnpromotedCorrections, runPromotionJob } from "@/app/actions/corrections";

type Correction = {
  id: string;
  original_text: string;
  corrected_text: string;
  context_snippet: string | null;
  created_at: string;
  promoted: boolean;
};

export default function CorrectionsPanel() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>("");

  async function refresh() {
    setLoading(true);
    const data = await getUnpromotedCorrections();
    setCorrections(data as Correction[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handlePromote() {
    setRunning(true);
    setResult("");
    try {
      const res = await runPromotionJob();
      setResult(
        res.groups > 0
          ? `Promoted ${res.groups} recurring correction(s) covering ${res.promoted} logged edit(s) into the shared dictionary.`
          : "No corrections met the promotion threshold yet (needs ≥5 occurrences across ≥3 users).",
      );
      await refresh();
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-2xl bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">AI pipeline corrections</h2>
        <p className="text-sm text-gray-500">
          Every time a clinician edits an AI-generated note or letter, the change is logged here
          (spec Section 3.4). Once a fix recurs across enough notes and users, the promotion job
          folds it into the shared correction dictionary so preprocess() catches it automatically
          next time (Section 3.5). Review weekly before promoting.
        </p>
      </div>

      <button
        onClick={handlePromote}
        disabled={running}
        className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
      >
        {running ? "Running…" : "Run promotion job now"}
      </button>
      {result && <p className="text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">{result}</p>}

      <div>
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
          Unpromoted corrections ({corrections.length}{corrections.length === 100 ? "+" : ""})
        </h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : corrections.length === 0 ? (
          <p className="text-sm text-gray-400">No unpromoted corrections logged yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {corrections.map((c) => (
              <div key={c.id} className="px-3 py-2 text-xs space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-rose-500 line-through">{c.original_text}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-emerald-600 font-medium">{c.corrected_text}</span>
                </div>
                {c.context_snippet && <p className="text-gray-400 truncate">…{c.context_snippet}…</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
