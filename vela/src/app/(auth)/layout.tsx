import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Shield } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getSessionUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { SESSION_IDLE_LABEL } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await isSharedPreviewDemoMode()) redirect("/dashboard");
  if (await getSessionUserId()) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-bank-bg">
      {/* Compact bank header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3.5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-4 text-[11.5px] text-gray-600">
            <a href="/#security" className="hover:text-bank-navy hover:underline">
              Help & Support
            </a>
            <a href="/#security" className="hover:text-bank-navy hover:underline">
              Contact Us
            </a>
            <a href="/#rates" className="hover:text-bank-navy hover:underline">
              Locations
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 px-4 py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>{children}</div>

          {/* Security sidebar */}
          <aside className="space-y-5">
            <div className="border border-gray-300 bg-white p-5 shadow-panel">
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-bank-navy">
                <Lock className="h-4 w-4 text-bank-red" /> Secure sign-in
              </h2>
              <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
                We protect your sign-in session and sign you out after {SESSION_IDLE_LABEL} of
                inactivity. We&apos;ll never ask for your full password, PIN, or Social Security
                number by email or text.
              </p>
            </div>
            <div className="border border-gray-300 bg-white p-5 shadow-panel">
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-bank-navy">
                <Shield className="h-4 w-4 text-bank-red" /> Account security
              </h2>
              <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
                We monitor accounts for suspicious activity and protect your information. Contact us immediately if you notice anything unusual.
              </p>
              <a href="/#security" className="mt-3 inline-block text-[12px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
                Read security information
              </a>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-[10.5px] text-gray-500">
          <span>© 2026 FMB.</span>
          <span className="ml-auto">Privacy · Terms · Accessibility</span>
        </div>
      </footer>
    </div>
  );
}
