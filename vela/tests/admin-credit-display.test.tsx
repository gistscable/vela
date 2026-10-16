// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransactionRow } from "@/components/transactions";
import type { Transaction } from "@/lib/db";

const baseTransaction = (senderName: string): Transaction => ({
  id: "admin-credit-1",
  accountId: "customer-checking-1",
  amount: 12_500,
  type: "DEPOSIT",
  category: "TRANSFER",
  description: senderName,
  counterparty: "Lakeview Credit Union · •••• 3141",
  paymentMethod: "WIRE",
  status: "PENDING_APPROVAL",
  reference: "adminwire_example",
  balanceAfter: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  account: {} as Transaction["account"],
});

describe("admin-entered credit activity display", () => {
  it.each(["Jordan Lee", "Acme Community Foundation"])("shows only the entered sender name: %s", (senderName) => {
    render(<TransactionRow tx={baseTransaction(senderName)} />);

    expect(screen.getByText(senderName)).toBeInTheDocument();
    expect(screen.queryByText(`Payment from ${senderName}`)).toBeNull();
    expect(screen.queryByText("Lakeview Credit Union · •••• 3141")).toBeNull();
    expect(screen.getByText(/Processing/)).toBeInTheDocument();
  });
});
