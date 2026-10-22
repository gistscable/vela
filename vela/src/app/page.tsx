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
  { icon: Landmark, title: "Checking accounts", body: "Manage everyday spending with convenient account access and a debit card.", link: "Explore checking" },
  { icon: PiggyBank, title: "Savings & CDs", body: "Organize your savings and plan for the goals that matter to you.", link: "Explore savings" },
  { icon: CreditCard, title: "Credit cards", body: "Find card features for everyday purchases, travel, and recurring expenses.", link: "Explore cards" },
  { icon: Home, title: "Home loans", body: "Explore options and guidance for planning your next home purchase.", link: "Explore home loans" },
];

const FEATURE_ROWS = [
  { product: "Everyday accounts", detail: "Keep track of balances and recent activity." },
  { product: "Savings tools", detail: "Organize savings around your plans and goals." },
  { product: "Card services", detail: "Review card details and manage everyday purchases." },
  { product: "Account insights", detail: "Find statements, transactions, and helpful account details." },
];

const FOOTER_COLS = [
  {
    title: "Personal",
    links: ["Checking", "Savings & CDs", "Credit Cards", "Mortgage", "Auto Loans", "Home Equity"],
  },
  {
    title: "Business & Wealth",
    links: ["Small Business", "Commercial Banking", "Wealth Management", "FMB Investing", "Private Bank", "Retirement"],
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
            <a href="#products" className="flex items-center gap-1.5 px-2.5 py-1 hover:text-bank-navy hover:underline">
              <Landmark className="h-3 w-3" /> Products
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
          <div className="flex items-center gap-2 sm:gap-2.5">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-bank-red px-4 text-[13px] font-bold text-white hover:bg-bank-redDark sm:px-5"
              >
                My account <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded border border-gray-400 bg-white px-3.5 text-[13px] font-bold leading-none text-bank-navy hover:bg-gray-50 sm:px-4"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded bg-bank-red px-3.5 text-center text-[13px] font-bold leading-tight text-white hover:bg-bank-redDark sm:px-5"
                >
                  <span>Enroll</span>
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
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-bank-red">Everyday banking, made simple</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-tight text-bank-navy sm:text-[42px]">
              Make your money easier to manage.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-gray-700">
              Bring everyday spending, savings, and plans for what comes next together with clear, convenient account tools.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? "/dashboard" : "/signup"}
                className="inline-flex h-11 items-center rounded bg-bank-red px-7 text-[14px] font-bold text-white hover:bg-bank-redDark"
              >
                {signedIn ? "View your accounts" : "Enroll"}
              </Link>
              <a
                href="#features"
                className="inline-flex h-11 items-center rounded border border-bank-navy bg-white px-7 text-[14px] font-bold text-bank-navy hover:bg-gray-50"
              >
                Explore features
              </a>
            </div>
          </div>

          <div className="relative min-h-[320px] lg:min-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-couple.jpg"
              alt="Customers reviewing their finances at home"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute bottom-5 left-5 right-5 border border-gray-300 bg-white p-5 shadow-dropdown">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Everyday account tools</p>
              <p className="mt-1.5 text-[24px] font-bold leading-tight text-bank-navy">A clear view of what matters.</p>
              <p className="mt-1.5 text-[11px] text-gray-500">Manage your accounts and stay connected to your plans.</p>
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
              <a href="#features" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
                {t.link} <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------- EVERYDAY FEATURES ---------------------------- */}
      <section id="features" className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-[1180px] px-4 py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[22px] font-bold text-bank-navy">Tools for everyday life</h2>
              <p className="mt-1 text-[12px] text-gray-500">Straightforward ways to stay organized and plan ahead.</p>
            </div>
            <Link href={signedIn ? "/dashboard" : "/signup"} className="text-[12.5px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
              {signedIn ? "View your accounts" : "Enroll"}
            </Link>
          </div>
          <div className="mt-6 overflow-x-auto border border-gray-300 bg-white">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-300 bg-bank-sand text-[11px] uppercase tracking-wide text-bank-navy">
                  <th className="px-5 py-3 font-bold">Feature</th>
                  <th className="px-5 py-3 font-bold">How it helps</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.product} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3.5 font-semibold text-bank-navy">{row.product}</td>
                    <td className="px-5 py-3.5 text-gray-600">{row.detail}</td>
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
                { icon: Lock, title: "Secure sign-in", body: "Multi-factor authentication, encrypted sessions, and automatic sign-out when you are idle." },
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
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bank-red">FMB Wealth</p>
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
          <h2 className="text-[22px] font-bold text-bank-navy">Getting started with FMB</h2>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              { n: "1", icon: Users, title: "Enroll", body: "Share a few basic details to get started." },
              { n: "2", icon: Briefcase, title: "Set up your account", body: "Choose how to organize your everyday spending and savings." },
              { n: "3", icon: Calculator, title: "Stay in control", body: "Review account activity and manage everyday financial tasks." },
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
              Explore account features and everyday tools from FMB.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-11 items-center rounded bg-bank-red px-7 text-[14px] font-bold text-white hover:bg-bank-redDark">
              {signedIn ? "View your accounts" : "Enroll"}
            </Link>
            <Link href={signedIn ? "/transfer" : "/login"} className="inline-flex h-11 items-center rounded border border-white/40 px-7 text-[14px] font-bold text-white hover:bg-white/10">
              {signedIn ? "Make a transfer" : "Log in"}
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
              <span>© 2026 FMB.</span>
            </div>
            <p className="mt-4 text-[10px] text-gray-500">
              Privacy Policy · Terms of Use · Accessibility · Service Agreement · Your Privacy Choices
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
