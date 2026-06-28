"use client";

import { useState } from "react";
import { purgeOldRecords } from "@/app/actions/admin";

export default function AdminPurgePanel() {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handlePurge() {
    setLoading(true);
    setResult("");

    const res = await purgeOldRecords(365);

    setLoading(false);

    if (res.error) {
      setResult(`Error: ${res.error}`);
      return;
    }

    setResult(
      `Purged ${res.result.purged_patients} completed patient record(s) and ${res.result.purged_audit_rows} old audit_log row(s).`,
    );
  }

  return (
    <div className="max-w-lg bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div>
        <h2 className="font-semibold mb-1">Data retention purge</h2>
        <p className="text-sm text-gray-500">
          Removes patients whose perioperative journey is fully complete and
          older than 365 days, and trims audit_log rows older than 365 days.
        </p>
      </div>
      <button
        onClick={handlePurge}
        disabled={loading}
        className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Purging..." : "Run purge now"}
      </button>
      {result && <p className="text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">{result}</p>}
    </div>
  );
}
