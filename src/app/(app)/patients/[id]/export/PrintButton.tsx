"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90"
    >
      Print / Save as PDF
    </button>
  );
}
