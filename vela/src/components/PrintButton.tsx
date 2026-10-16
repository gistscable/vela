"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex h-9 items-center gap-2 rounded border border-gray-400 bg-white px-4 text-[12px] font-bold text-bank-navy hover:bg-gray-50"
    >
      <Printer className="h-3.5 w-3.5" /> Print / Save PDF
    </button>
  );
}
