"use client";

import { useState } from "react";
import { purgeOldRecords } from "@/app/actions/admin";

export default function AdminPage() {
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
    <div style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Data Retention</h1>
      <p>
        Removes patients whose perioperative journey is fully complete and
        older than 365 days, and trims audit_log rows older than 365 days.
        Admin only — non-admins will get an error from the database.
      </p>
      <button onClick={handlePurge} disabled={loading}>
        {loading ? "Purging..." : "Run purge now"}
      </button>
      {result && <p style={{ marginTop: 12 }}>{result}</p>}
    </div>
  );
}
