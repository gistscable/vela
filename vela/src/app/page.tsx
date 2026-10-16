import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Calculator,
  Car,
  ChevronRight,
  CreditCard,
  Home,
  Landmark,
  Lock,
  PiggyBank,
  Search,
  Shield,
  Phone,
  MapPin,
  Users,
  TrendingUp,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { getSessionUserId, isSharedPreviewDemoMode } from "@/lib/auth";

const UTILITY_LINKS = ["Locations", "Help & Support", "Contact Us", "Schedule an Appointment"];

const MAIN_NAV = [
  "Checking",
  "Savings & CDs",
  "Credit Cards",
  "Mortgage",
  "Auto Loans",
  "Investing",
  "Small Business",
];

const PRODUCT_TILES = [
  { icon: Landmark, title: "Checking accounts", body: "Everyday banking with no monthly fees, overdraft protection, and a debit card.", link: "Compare checking" },
  { icon: PiggyBank, title: "Savings & CDs", body: "Earn up to 4.25% APY with our High-Yield Online Savings account.", link: "Compare savings" },
  { icon: CreditCard, title: "Credit cards", body: "Cash back, travel rewards, and low introductory APR offers.", link: "Find a card" },
  { icon: Home, title: "Home loans", body: "Mortgage rates from 5.875% APR. Prequalify in minutes with no impact to credit.", link: "Explore mortgages" },
];

const RATE_ROWS = [
  { product: "High-Yield Online Savings", rate: "4.10%", apy: "4.25%", note: "Minimum $500 to open" },
  { product: "12-Month Certificate of Deposit", rate: "3.90%", apy: "4.00%", note: "Minimum $1,000 to open" },
  { product: "60-Month Certificate of Deposit", rate: "3.45%", apy: "3.50%", note: "Minimum $1,000 to open" },
  { product: "Advantage SafeBalance Banking®", rate: "0.02%", apy: "0.02%", note: "No monthly maintenance fee" },
];

const FOOTER_COLS = [
  {
    title: "Personal",
    links: ["Checking", "Savings & CDs", "Credit Cards", "Mortgage", "Auto Loans", "Home Equity"],
  },
  {
    title: "Business & Wealth",
    links: ["Small Business", "Commercial Banking", "Wealth Management", "Merrill Investing", "Private Bank", "Retirement"],
  },
  {
    title: "Support",
    links: ["Help & Support", "Contact Us", "Find a Location", "Schedule an Appointment", "Accessibility", "Report Fraud"],
  },
  {
    title: "About Us",
    links: ["Our Story", "Investor Relations", "Newsroom", "Careers", "Corporate Social Responsibility", "Security Center"],
  },
];

export default async function LandingPage() {
  const sharedPreview = await isSharedPreviewDemoMode();
  const signedIn = sharedPreview || Boolean(await getSessionUserId());

  return (
    <div className="min-h-screen bg-white">
      {/* --------------------------- UTILITY BAR --------------------------- */}
      <div className="border-b border-gray-200 bg-gray-100">
        <div className="mx-auto flex h-9 max-w-[1180px] items-center justify-between px-4">
          <nav className="hidden items-center gap-1 text-[11px] text-gray-600 sm:flex">
            <a href="#rates" className="flex items-center gap-1.5 px-2.5 py-1 hover:text-bank-navy hover:underline">
              <MapPin className="h-3 w-3" /> Locations
            </a>
            <a href="#security" className="px-2.5 py-1 hover:text-bank-navy hover:underline">Help & Support</a>
            <a href="#security" className="px-2.5 py-1 hover:text-bank-navy hover:underline">Contact Us</a>
            <a href="#how" className="px-2.5 py-1 hover:text-bank-navy hover:underline">Schedule an Appointment</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded border border-gray-300 bg-white px-2 py-1 sm:flex">
              <Search className="h-3 w-3 text-gray-500" />
              <input
                className="w-32 bg-transparent text-[11px] text-gray-700 placeholder:text-gray-400 focus:outline-none"
                placeholder="How can we help?"
              />
            </div>
            <span className="text-[11px] text-gray-500">EN | ES</span>
          </div>
        </div>
      </div>

      {/* ------------------------------ HEADER ------------------------------ */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3.5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-0.5 lg:flex">
            {MAIN_NAV.map((item) => (
              <a
                key={item}
                href="#products"
                className="px-3 py-2 text-[13px] font-semibold text-gray-700 hover:text-bank-red"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-1.5 rounded bg-bank-red px-5 text-[13px] font-bold text-white hover:bg-bank-redDark"
              >
                Online Banking <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded border border-gray-400 bg-white px-4 text-[13px] font-bold text-bank-navy hover:bg-gray-50"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 items-center rounded bg-bank-red px-5 text-[13px] font-bold text-white hover:bg-bank-redDark"
                >
                  Open an account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------- HERO ------------------------------- */}
      <section className="border-b border-gray-200 bg-bank-sand">
        <div className="mx-auto grid max-w-[1180px] items-stretch gap-0 px-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="py-10 pr-0 lg:py-14 lg:pr-12">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-bank-red">Limited-time offer</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-tight text-bank-navy sm:text-[42px]">
              Earn <span className="text-bank-red">$300</span> when you open a new checking account
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-gray-700">
              Set up direct deposit with Advantage SafeBalance Banking® and we&apos;ll deposit a $300
              welcome bonus. Plus, enjoy no monthly maintenance fees and access to 15,000+ ATMs.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? "/dashboard" : "/signup"}
                className="inline-flex h-11 items-center rounded bg-bank-red px-7 text-[14px] font-bold text-white hover:bg-bank-redDark"
              >
                {signedIn ? "View your accounts" : "Open an account"}
              </Link>
              <a
                href="#rates"
                className="inline-flex h-11 items-center rounded border border-bank-navy bg-white px-7 text-[14px] font-bold text-bank-navy hover:bg-gray-50"
              >
                See today&apos;s rates
              </a>
            </div>
            <p className="mt-5 max-w-xl text-[10.5px] leading-relaxed text-gray-500">
              Offer valid for new personal checking customers through 12/31/2026. Qualifying direct
              deposits totaling $2,000 or more must be received within 90 days of account opening.
              Bonus will be deposited within 60 days of meeting requirements. Limit one bonus per
              customer. See offer details for full terms. <span className="font-semibold">Illustrative offer only; First Meridian is fictional and provides no real accounts or payments.</span>
            </p>
          </div>

          <div className="relative min-h-[320px] lg:min-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-couple.jpg"
              alt="Customers reviewing their finances at home"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* rate card overlay */}
            <div className="absolute bottom-5 left-5 right-5 border border-gray-300 bg-white p-5 shadow-dropdown">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">High-Yield Online Savings</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-[38px] font-bold leading-none text-bank-red">4.25%</span>
                <span className="text-[14px] font-semibold text-gray-600">APY</span>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">
                Annual Percentage Yield as of Oct 15, 2026. Minimum $500 to open. Rates subject to change.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- PRODUCT TILES ---------------------------- */}
      <section id="products" className="mx-auto max-w-[1180px] px-4 py-12">
        <h2 className="text-[22px] font-bold text-bank-navy">Explore our products</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_TILES.map((t) => (
            <div key={t.title} className="flex flex-col border border-gray-300 bg-white p-5 shadow-panel">
              <div className="flex h-10 w-10 items-center justify-center rounded border border-bank-sand bg-bank-sand text-bank-navy">
                <t.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3.5 text-[15px] font-bold text-bank-navy">{t.title}</h3>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-gray-600">{t.body}</p>
              <a href="#rates" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
                {t.link} <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------- RATES ------------------------------- */}
      <section id="rates" className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-[1180px] px-4 py-12">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-[22px] font-bold text-bank-navy">Today&apos;s rates</h2>
              <p className="mt-1 text-[12px] text-gray-500">Rates as of October 15, 2026. Rates subject to change.</p>
            </div>
            <a href="#products" className="text-[12.5px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
              Compare all products
            </a>
          </div>
          <div className="mt-6 overflow-x-auto border border-gray-300 bg-white">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-300 bg-bank-sand text-[11px] uppercase tracking-wide text-bank-navy">
                  <th className="px-5 py-3 font-bold">Product</th>
                  <th className="px-5 py-3 font-bold">Interest rate</th>
                  <th className="px-5 py-3 font-bold">APY</th>
                  <th className="hidden px-5 py-3 font-bold sm:table-cell">Details</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {RATE_ROWS.map((r) => (
                  <tr key={r.product} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-semibold text-bank-navy">{r.product}</td>
                    <td className="px-5 py-3.5 tabular-nums text-gray-800">{r.rate}</td>
                    <td className="px-5 py-3.5 font-bold tabular-nums text-bank-red">{r.apy}</td>
                    <td className="hidden px-5 py-3.5 text-gray-500 sm:table-cell">{r.note}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={signedIn ? "/transfer?tab=deposit" : "/signup"} className="font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
                        Open now
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ----------------------------- SECURITY ----------------------------- */}
      <section id="security" className="mx-auto max-w-[1180px] px-4 py-12">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[22px] font-bold text-bank-navy">Your security is our priority</h2>
            <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-gray-600">
              We use advanced encryption, 24/7 fraud monitoring, and zero-liability protection to help
              keep your accounts safe. If something doesn&apos;t look right, our fraud specialists are
              available around the clock.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              {[
                { icon: Shield, title: "Zero liability", body: "You're never responsible for unauthorized transactions." },
                { icon: Lock, title: "Secure sign-in", body: "Multi-factor authentication and encrypted sessions." },
                { icon: Phone, title: "24/7 support", body: "Real people, any time — including holidays." },
                { icon: Users, title: "Fraud alerts", body: "Instant notifications when we spot unusual activity." },
              ].map((f) => (
                <div key={f.title} className="border border-gray-300 bg-white p-4">
                  <f.icon className="h-5 w-5 text-bank-red" />
                  <h3 className="mt-2.5 text-[13px] font-bold text-bank-navy">{f.title}</h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="how" className="border border-gray-300 bg-white shadow-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/promo-advisor.jpg"
              alt="Financial advisor meeting with clients"
              className="h-56 w-full object-cover"
            />
            <div className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bank-red">First Meridian Wealth</p>
              <h3 className="mt-2 text-[19px] font-bold leading-snug text-bank-navy">
                Guidance from advisors who know your name
              </h3>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-gray-600">
                From your first savings account to retirement planning, our advisors are here with
                personalized strategies — in branch, by phone, or online.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={signedIn ? "/settings" : "/signup"} className="inline-flex h-10 items-center rounded bg-bank-navy px-5 text-[12.5px] font-bold text-white hover:bg-bank-navyDark">
                  Meet an advisor
                </Link>
                <a href="#products" className="inline-flex h-10 items-center rounded border border-gray-400 bg-white px-5 text-[12.5px] font-bold text-bank-navy hover:bg-gray-50">
                  Learn more
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- HOW IT WORKS ----------------------------- */}
      <section className="border-y border-gray-200 bg-bank-sand">
        <div className="mx-auto max-w-[1180px] px-4 py-12">
          <h2 className="text-[22px] font-bold text-bank-navy">Open an account in three steps</h2>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              { n: "1", icon: Users, title: "Tell us about you", body: "Apply online in under 5 minutes with your basic information. No paperwork required." },
              { n: "2", icon: Briefcase, title: "Fund your account", body: "Transfer from another bank, set up direct deposit, or deposit a check in the app." },
              { n: "3", icon: Calculator, title: "Start banking", body: "Pay bills, transfer money, and track your spending — all from Online Banking." },
            ].map((s) => (
              <div key={s.n} className="border border-gray-300 bg-white p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-bank-red text-[13px] font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-3.5 flex items-center gap-2 text-[15px] font-bold text-bank-navy">
                  <s.icon className="h-4 w-4 text-bank-navy" /> {s.title}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- CTA BAND ------------------------------- */}
      <section className="bg-bank-navy">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 px-4 py-11 md:flex-row md:items-center">
          <div>
            <h2 className="text-[24px] font-bold text-white">Ready to experience better banking?</h2>
            <p className="mt-1.5 text-[13.5px] text-white/75">
              Join First Meridian Bank today — it takes less than five minutes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-11 items-center rounded bg-bank-red px-7 text-[14px] font-bold text-white hover:bg-bank-redDark">
              Open an account
            </Link>
            <Link href={signedIn ? "/transfer" : "/login"} className="inline-flex h-11 items-center rounded border border-white/40 px-7 text-[14px] font-bold text-white hover:bg-white/10">
              {signedIn ? "Make a transfer" : "Log in to Online Banking"}
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------- FOOTER ------------------------------- */}
      <footer className="border-t border-gray-200 bg-gray-100">
        <div className="mx-auto max-w-[1180px] px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-bank-navy">{col.title}</h3>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#products" className="text-[12px] text-gray-600 hover:text-bank-navy hover:underline">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-gray-300 pt-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold text-bank-navy">
              <span>© 2026 First Meridian concept.</span>
            </div>
            <p className="mt-4 max-w-4xl text-[10px] leading-relaxed text-gray-500">
              <strong>Important:</strong> First Meridian is fictional and is not a licensed bank or payment
              service. No real accounts are opened, no funds are held or moved, and no bank payment is sent.
              It is not FDIC insured. Rates, offers and financial products shown here are illustrative, not
              a real offer or solicitation.
            </p>
            <p className="mt-3 text-[10px] text-gray-500">
              Privacy Policy · Terms of Use · Accessibility · Online Banking Agreement · Your Privacy Choices
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
