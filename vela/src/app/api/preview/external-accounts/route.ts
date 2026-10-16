import { NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { db } from "@/lib/db";
import { containsLongAccountLikeNumber, lastFourDigits } from "@/lib/external-account-display";
import { isPreviewApiOriginAllowed, previewCorsHeaders } from "@/lib/preview-api";

export const runtime = "nodejs";

const accountSchema = z.object({
  institutionName: z.string().trim().min(2).max(80).refine((value) => !containsLongAccountLikeNumber(value)),
  nickname: z.string().trim().min(2).max(60).refine((value) => !containsLongAccountLikeNumber(value)),
  accountType: z.enum(["CHECKING", "SAVINGS"]),
  accountNumber: z.string().trim().regex(/^\d{4,17}$/),
  routingNumber: z.string().trim().regex(/^\d{9}$/),
});

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: previewCorsHeaders(request) });
}

export async function OPTIONS(request: Request) {
  if (!(await isSharedPreviewDemoMode()) || !isPreviewApiOriginAllowed(request)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: previewCorsHeaders(request) });
}

export async function POST(request: Request) {
  if (!(await isSharedPreviewDemoMode()) || !isPreviewApiOriginAllowed(request)) {
    return json(request, { error: "This preview-only action is not available from this origin." }, 403);
  }

  let parsed;
  try {
    parsed = accountSchema.parse(await request.json());
  } catch {
    return json(request, { error: "Enter a bank name, nickname, 4–17 digit account number, and 9-digit routing number." }, 400);
  }

  const userId = await getEffectiveUserId();
  if (!userId) return json(request, { error: "The shared sample account is unavailable." }, 503);

  const count = await db.externalAccount.count({ where: { userId } });
  if (count >= 5) return json(request, { error: "You can save up to five external accounts." }, 400);

  const duplicate = await db.externalAccount.findFirst({
    where: {
      userId,
      institutionName: parsed.institutionName,
      nickname: parsed.nickname,
      accountMask: lastFourDigits(parsed.accountNumber),
    },
  });
  if (duplicate) return json(request, { error: "That external account is already saved." }, 409);

  const account = await db.externalAccount.create({
    data: {
      userId,
      institutionName: parsed.institutionName,
      nickname: parsed.nickname,
      accountType: parsed.accountType,
      accountMask: lastFourDigits(parsed.accountNumber),
      status: "PENDING_APPROVAL",
    },
    select: {
      id: true,
      institutionName: true,
      nickname: true,
      accountType: true,
      accountMask: true,
      createdAt: true,
    },
  });

  return json(request, { account }, 201);
}
