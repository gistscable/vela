import Link from "next/link";
import { Landmark, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/money";
import { Badge, Panel } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { PasswordForm, ProfileForm, UsernameForm } from "@/components/SettingsForms";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customer Service & Settings — First Meridian Bank" };

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

          <Panel title="Account status">
            <div className="space-y-2 text-[12px] text-gray-700">
              <p className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span>Member since</span>
                <span className="font-semibold">{formatDate(user.createdAt)}</span>
              </p>
              <p className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span>Identity verification</span>
                <Badge tone="amber">Not verified</Badge>
              </p>
              <p className="flex items-center justify-between">
                <span>Session security</span>
                <Badge tone="navy">Encrypted · 7-day</Badge>
              </p>
            </div>
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
