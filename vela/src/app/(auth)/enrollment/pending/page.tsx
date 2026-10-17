import Link from "next/link";
import type { Metadata } from "next";
import { Clock3 } from "lucide-react";

export const metadata: Metadata = { title: "Enrollment received — FMB" };

export default function EnrollmentPendingPage() {
  return (
    <section className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Enrollment received</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">Your enrollment is being processed.</p>
      </div>
      <div className="space-y-4 px-6 py-6">
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>You will be able to sign in once processing is complete. Please return to sign in later.</p>
        </div>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded border border-bank-navy bg-bank-navy px-7 text-[14px] font-bold text-white hover:bg-bank-navyDark">
          Go to sign in
        </Link>
      </div>
    </section>
  );
}
