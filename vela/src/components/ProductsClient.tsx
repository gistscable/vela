"use client";

import { useActionState } from "react";
import { applyProductAction, type ActionState } from "@/lib/actions";
import type { Product } from "@/lib/products";
import { Alert, Button, Input, Select } from "./ui";

export function ApplyProductForm({
  product,
  accounts,
}: {
  product: Product;
  accounts: { id: string; name: string; type: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(applyProductAction, null);
  const debitAccounts = accounts.filter((account) => product.debitAccountTypes?.includes(account.type));
  const needsAccount = product.kind === "DEBIT_CARD";
  const blocked = needsAccount && debitAccounts.length === 0;

  return (
    <form action={formAction} className="mt-3 space-y-2.5">
      <input type="hidden" name="productCode" value={product.code} />
      {needsAccount ? (
        <Select name="linkedAccountId" label="Draw from" defaultValue={debitAccounts[0]?.id} required disabled={blocked}>
          {debitAccounts.length === 0 ? (
            <option value="">Open a checking account first</option>
          ) : (
            debitAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))
          )}
        </Select>
      ) : product.kind === "ACCOUNT" ? (
        <Input name="nickname" label="Account nickname (optional)" placeholder={product.shortName} maxLength={40} autoComplete="off" />
      ) : null}
      {state?.error && <Alert tone="error" title="Application not submitted">{state.error}</Alert>}
      {state?.success && <Alert tone="success" title="Submitted">{state.message}</Alert>}
      <Button type="submit" variant="navy" size="sm" loading={pending} disabled={blocked}>
        {product.kind === "ACCOUNT" ? "Apply to open" : "Apply for this card"}
      </Button>
    </form>
  );
}
