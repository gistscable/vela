import Link from "next/link";
import { CreditCard, FileText, Landmark, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Badge, Panel } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { PasswordForm, ProfileForm, UsernameForm } from "@/components/SettingsForms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customer Service & Settings — FMB" };

const QUICK_LINKS = [
  { href: "/statements", label: "Statements & documents", body: "View and print your monthly statements.", icon: FileText },
  { href: "/cards", label: "Card services", body: "Freeze a card or change its daily limit.", icon: CreditCard },
  { href: "/linked-accounts", label: "Linked accounts", body: "Manage external accounts used for transfers.", icon: Landmark },
  { href: "/help", label: "Help & support", body: "Contact customer service or get security guidance.", icon: LifeBuoy },
] as const;

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader
        title="Customer Service & Settings"
        subtitle="Manage your profile, sign-in credentials, and account preferences."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profile information">
          <ProfileForm
            firstName={user.firstName}
            lastName={user.lastName}
            phone={user.phone}
            email={user.email}
          />
        </Panel>

        <div className="space-y-5">
          <Panel title="Sign-in & passcode">
            <div className="space-y-6">
              <UsernameForm username={user.username} />
              <PasswordForm />
            </div>
          </Panel>

          <Panel title="Two-step verification">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-bank-navy" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-gray-900">
                  Two-step verification
                  {user.mfaEnabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="amber">Not set up</Badge>}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                  {user.mfaEnabled
                    ? "A six-digit code is required every time you sign in and whenever you change your passcode. Lost your phone? Contact customer service to have your authenticator reset."
                    : "You will be asked to set up Authenticator code the next time you sign in."}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Quick links" bodyClassName="divide-y divide-gray-100 p-0">
            {QUICK_LINKS.map(({ href, label, body, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-bank-navy" />
                <span>
                  <span className="block text-[12px] font-semibold text-gray-900">{label}</span>
                  <span className="mt-0.5 block text-[11px] text-gray-600">{body}</span>
                </span>
              </Link>
            ))}
          </Panel>

          <Panel title="External accounts">
            <div className="flex items-start gap-3">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-bank-navy" />
              <div>
                <p className="text-[12px] font-semibold text-gray-900">Connect an external bank account</p>
                <p className="mt-1 text-[11px] text-gray-600">View connected accounts and manage transfer destinations.</p>
                <Link href="/linked-accounts" className="mt-2 inline-block text-[11px] font-semibold text-bank-link underline underline-offset-2">Manage linked accounts &gt;</Link>
              </div>
            </div>
          </Panel>

          <div className="border-l-4 border-bank-red bg-gray-50 p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy">
              <ShieldCheck className="h-4 w-4 text-bank-red" /> Security Center
            </h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-600">
              We monitor accounts for suspicious activity. Visit Help & Support for security guidance and help with your account.
            </p>
            <Link href="/help" className="mt-2 inline-block text-[11px] font-semibold text-bank-link underline underline-offset-2">Help & support &gt;</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
