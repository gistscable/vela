import { Briefcase, CreditCard, Landmark, PiggyBank, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccounts } from "@/lib/queries";
import { PRODUCTS, productKindLabel, type Product } from "@/lib/products";
import { formatCents } from "@/lib/money";
import { PageHeader } from "@/components/transactions";
import { Badge, Panel } from "@/components/ui";
import { ApplyProductForm } from "@/components/ProductsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Open an account — FMB" };

const CATEGORIES: { id: Product["category"]; title: string; body: string }[] = [
  { id: "personal", title: "Personal banking", body: "Additional checking, savings, money market and CD accounts." },
  { id: "business", title: "Business banking", body: "Business Advantage checking and savings for operating funds." },
  { id: "cards", title: "Debit and credit cards", body: "Apply for a debit card on a checking account, or a credit card with its own balance. Cards appear below your accounts after approval." },
];

function productIcon(product: Product) {
  if (product.kind !== "ACCOUNT") return CreditCard;
  if (product.accountType === "BUSINESS_CHECKING") return Briefcase;
  if (product.accountType === "SAVINGS" || product.accountType === "BUSINESS_SAVINGS" || product.accountType === "MONEY_MARKET") return PiggyBank;
  if (product.accountType === "CD") return Landmark;
  return Wallet;
}

export default async function ProductsPage() {
  const user = await requireUser();
  const [accounts, applications] = await Promise.all([
    getAccounts(user.id),
    db.productApplication.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const pending = applications.filter((application) => application.status === "PENDING_APPROVAL");

  return (
    <div>
      <PageHeader
        title="Open an account or apply for a card"
        subtitle="Choose a product. New accounts and cards appear on Account Summary after an administrator approves the application."
      />

      {pending.length > 0 && (
        <Panel title={`Awaiting review · ${pending.length}`} className="mb-5" bodyClassName="divide-y divide-gray-100 p-0">
          {pending.map((application) => {
            const product = PRODUCTS.find((item) => item.code === application.productCode);
            return (
              <div key={application.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{product?.name ?? application.productCode}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">{productKindLabel(application.kind)}{application.nickname ? ` · ${application.nickname}` : ""}</p>
                </div>
                <Badge tone="amber">Awaiting approval</Badge>
              </div>
            );
          })}
        </Panel>
      )}

      <div className="space-y-6">
        {CATEGORIES.map((category) => (
          <Panel key={category.id} title={category.title} bodyClassName="p-0">
            <p className="border-b border-gray-100 px-5 py-3 text-[12px] leading-relaxed text-gray-600">{category.body}</p>
            <div className="divide-y divide-gray-100">
              {PRODUCTS.filter((product) => product.category === category.id).map((product) => {
                const Icon = productIcon(product);
                return (
                  <article key={product.code} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)]">
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-bank-sand bg-bank-sand text-bank-navy">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-[14px] font-bold text-bank-navy">{product.name}</h3>
                        <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{product.description}</p>
                        {product.apy ? <p className="mt-1 text-[11px] font-semibold text-bank-red">{product.apy.toFixed(2)}% APY</p> : null}
                        {product.creditLimit ? <p className="mt-1 text-[11px] text-gray-500">Credit line {formatCents(product.creditLimit)}</p> : null}
                      </div>
                    </div>
                    <ApplyProductForm product={product} accounts={accounts.map((account) => ({ id: account.id, name: account.name, type: account.type }))} />
                  </article>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
