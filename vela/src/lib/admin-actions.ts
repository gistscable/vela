"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { containsLongAccountLikeNumber, lastFourDigits, safeInstitutionName } from "@/lib/external-account-display";
import { parseCents } from "@/lib/money";
import { ensureUserHistory } from "@/lib/history";

function randomRef(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function refreshApprovalViews() {
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/receive");
  revalidatePath("/bill-pay");
  revalidatePath("/accounts", "layout");
}

export async function approveTransactionGroupAction(formData: FormData) {
  const admin = await requireAdmin();
  const groupKey = String(formData.get("groupKey") ?? "").trim();
  const reference = groupKey.startsWith("ref:") ? groupKey.slice(4) : null;
  const transactionId = groupKey.startsWith("id:") ? groupKey.slice(3) : null;
  if (!reference && !transactionId) redirect("/admin?notice=unavailable");
  const pendingWhere = reference ? { reference, status: "PENDING_APPROVAL" } : { id: transactionId!, status: "PENDING_APPROVAL" };

  const pendingRows = await db.transaction.findMany({
    where: pendingWhere,
    select: { id: true, accountId: true, amount: true },
  });
  if (pendingRows.length === 0) redirect("/admin?notice=unavailable");

  try {
    await db.$transaction(async (tx) => {
      const accountOwners = await tx.account.findMany({
        where: { id: { in: [...new Set(pendingRows.map((row) => row.accountId))] } },
        select: { user: { select: { enrollmentStatus: true } } },
      });
      if (accountOwners.some((account) => account.user.enrollmentStatus !== "APPROVED")) {
        throw new Error("ENROLLMENT_PENDING");
      }
      const claimed = await tx.transaction.updateMany({
        where: pendingWhere,
        data: { status: "PROCESSING_APPROVAL" },
      });
      if (claimed.count !== pendingRows.length) throw new Error("ALREADY_REVIEWED");

      const deltas = new Map<string, number>();
      const rowsByAccount = new Map<string, typeof pendingRows>();
      for (const row of pendingRows) {
        deltas.set(row.accountId, (deltas.get(row.accountId) ?? 0) + row.amount);
        const forAccount = rowsByAccount.get(row.accountId) ?? [];
        forAccount.push(row);
        rowsByAccount.set(row.accountId, forAccount);
      }

      const now = new Date();
      for (const [accountId, delta] of deltas) {
        let changed = { count: 1 };
        if (delta < 0) {
          changed = await tx.account.updateMany({
            where: { id: accountId, status: "ACTIVE", balance: { gte: Math.abs(delta) } },
            data: { balance: { decrement: Math.abs(delta) } },
          });
        } else if (delta > 0) {
          changed = await tx.account.updateMany({
            where: { id: accountId, status: "ACTIVE" },
            data: { balance: { increment: delta } },
          });
        }
        if (changed.count !== 1) {
          if (delta < 0) throw new Error("INSUFFICIENT_FUNDS");
          throw new Error("ACCOUNT_UNAVAILABLE");
        }

        const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        for (const row of rowsByAccount.get(accountId) ?? []) {
          await tx.transaction.update({
            where: { id: row.id },
            data: {
              status: "COMPLETED",
              reviewedById: admin.id,
              reviewedAt: now,
              balanceAfter: account.balance,
            },
          });
        }
      }

      if (reference) {
        await tx.billPayment.updateMany({
          where: { confirmationNumber: reference, status: "PENDING_APPROVAL" },
          data: { status: "SCHEDULED" },
        });
        await tx.moneyRequest.updateMany({
          where: { reference, status: "PENDING_APPROVAL" },
          data: { status: "PAID", paidAt: now },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ENROLLMENT_PENDING") redirect("/admin?notice=enrollment-pending");
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") redirect("/admin?notice=insufficient");
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") redirect("/admin?notice=account");
    if (error instanceof Error && error.message === "ALREADY_REVIEWED") redirect("/admin?notice=unavailable");
    console.error("Admin transaction approval failed", error);
    redirect("/admin?notice=error");
  }

  refreshApprovalViews();
  redirect("/admin?notice=approved");
}

export async function rejectTransactionGroupAction(formData: FormData) {
  const admin = await requireAdmin();
  const groupKey = String(formData.get("groupKey") ?? "").trim();
  const reference = groupKey.startsWith("ref:") ? groupKey.slice(4) : null;
  const transactionId = groupKey.startsWith("id:") ? groupKey.slice(3) : null;
  if (!reference && !transactionId) redirect("/admin?notice=unavailable");
  const pendingWhere = reference ? { reference, status: "PENDING_APPROVAL" } : { id: transactionId!, status: "PENDING_APPROVAL" };
  const now = new Date();

  const rejected = await db.$transaction(async (tx) => {
    const result = await tx.transaction.updateMany({
      where: pendingWhere,
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
    });
    if (result.count === 0) return 0;
    if (reference) {
      await tx.billPayment.updateMany({
        where: { confirmationNumber: reference, status: "PENDING_APPROVAL" },
        data: { status: "CANCELED" },
      });
      await tx.moneyRequest.updateMany({
        where: { reference, status: "PENDING_APPROVAL" },
        data: { status: "DECLINED" },
      });
    }
    return result.count;
  });

  if (rejected === 0) redirect("/admin?notice=unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=rejected");
}

export async function reviewExternalAccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const externalAccountId = String(formData.get("externalAccountId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!externalAccountId || !["issue", "reject"].includes(decision)) redirect("/admin?notice=external-unavailable");

  const where = { id: externalAccountId, status: "PENDING_APPROVAL" };
  const now = new Date();
  if (decision === "reject") {
    const result = await db.externalAccount.updateMany({
      where,
      data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
    });
    if (result.count !== 1) redirect("/admin?notice=external-unavailable");
    revalidatePath("/admin");
    revalidatePath("/linked-accounts");
    revalidatePath("/transfer");
    redirect("/admin?notice=external-rejected");
  }

  const amount1 = randomInt(1, 100);
  let amount2 = randomInt(1, 100);
  while (amount2 === amount1) amount2 = randomInt(1, 100);
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const result = await db.externalAccount.updateMany({
    where,
    data: {
      status: "CHALLENGE_ACTIVE",
      microdepositAmount1: amount1,
      microdepositAmount2: amount2,
      microdepositExpiresAt: expiresAt,
      microdepositAttempts: 0,
      reviewedById: admin.id,
      reviewedAt: now,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=external-unavailable");

  revalidatePath("/admin");
  revalidatePath("/linked-accounts");
  revalidatePath("/transfer");
  redirect("/admin?notice=challenge-issued");
}

export async function reviewEnrollmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!userId || !["approve", "reject"].includes(decision)) redirect("/admin?notice=enrollment-unavailable");

  const where = { id: userId, role: "CUSTOMER", enrollmentStatus: "PENDING_APPROVAL" };
  const now = new Date();
  if (decision === "approve") {
    const result = await db.user.updateMany({
      where,
      data: { enrollmentStatus: "APPROVED", enrollmentReviewedById: admin.id, enrollmentReviewedAt: now },
    });
    if (result.count !== 1) redirect("/admin?notice=enrollment-unavailable");
    // Future users automatically receive the standard Jan 2023 -> Oct 2026
    // history (and Checking/Savings accounts if signup did not create them).
    // ensureUserHistory is a no-op once a user has completed activity, so
    // this never overwrites a customer's real transactions.
    try {
      await ensureUserHistory(db, userId);
    } catch (error) {
      console.error("Failed to provision account history for approved user", userId, error);
    }
    refreshApprovalViews();
    redirect("/admin?notice=enrollment-approved");
  }

  const rejected = await db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where,
      data: { enrollmentStatus: "REJECTED", enrollmentReviewedById: admin.id, enrollmentReviewedAt: now },
    });
    if (result.count !== 1) return 0;
    const accounts = await tx.account.findMany({ where: { userId }, select: { id: true } });
    if (accounts.length > 0) {
      await tx.transaction.updateMany({
        where: { accountId: { in: accounts.map((account) => account.id) }, status: "PENDING_APPROVAL" },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now },
      });
    }
    return result.count;
  });
  if (rejected !== 1) redirect("/admin?notice=enrollment-unavailable");
  refreshApprovalViews();
  redirect("/admin?notice=enrollment-rejected");
}

export async function adminResetAuthenticatorAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId || formData.get("confirm") !== "yes") redirect("/admin?notice=authenticator-reset-confirm");

  const result = await db.user.updateMany({
    where: { id: userId, enrollmentStatus: "APPROVED", mfaEnabled: true },
    data: {
      mfaEnabled: false,
      totpSecretEncrypted: null,
      totpLastUsedStep: null,
      mfaPendingSecretEncrypted: null,
      mfaPendingExpiresAt: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    },
  });
  if (result.count !== 1) redirect("/admin?notice=authenticator-unavailable");
  refreshApprovalViews();
  revalidatePath("/login");
  redirect("/admin?notice=authenticator-reset");
}

export async function adminCreditAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = z.object({
    accountId: z.string().min(1).max(100),
    paymentMethod: z.enum(["ACH", "WIRE"]),
    sourceName: z.string().trim().min(2).max(80).refine((value) => !containsLongAccountLikeNumber(value)),
    sourceLast4: z.string().regex(/^\d{4}$/),
    amountText: z.string().trim().min(1).max(24),
  }).safeParse({
    accountId: formData.get("accountId"),
    paymentMethod: formData.get("paymentMethod"),
    sourceName: formData.get("sourceName"),
    sourceLast4: formData.get("sourceLast4"),
    amountText: formData.get("amount"),
  });
  if (!parsed.success) redirect("/admin?notice=credit-error");
  if (formData.get("confirm") !== "yes") redirect("/admin?notice=credit-confirm");

  const amount = parseCents(parsed.data.amountText);
  if (!amount || amount < 100 || amount > 10_000_000) redirect("/admin?notice=credit-error");
  const account = await db.account.findFirst({
    where: { id: parsed.data.accountId, status: "ACTIVE", user: { enrollmentStatus: "APPROVED" } },
  });
  if (!account) redirect("/admin?notice=account");

  const reference = randomRef(parsed.data.paymentMethod === "ACH" ? "adminach" : "adminwire");
  await db.transaction.create({
    data: {
      accountId: account.id,
      amount,
      type: "DEPOSIT",
      category: "TRANSFER",
      description: "Admin credit request",
      counterparty: `${safeInstitutionName(parsed.data.sourceName)} · •••• ${lastFourDigits(parsed.data.sourceLast4)}`,
      paymentMethod: parsed.data.paymentMethod,
      status: "PENDING_APPROVAL",
      reference,
    },
  });

  refreshApprovalViews();
  redirect("/admin?notice=credit-submitted");
}
