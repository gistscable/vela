/** Catalog of accounts and cards a customer can apply for. */

export type ProductKind = "ACCOUNT" | "DEBIT_CARD" | "CREDIT_CARD";
export type ProductCategory = "personal" | "business" | "cards";

export type Product = {
  code: string;
  kind: ProductKind;
  name: string;
  shortName: string;
  description: string;
  category: ProductCategory;
  accountType?: string;
  apy?: number;
  creditLimit?: number;
  dailyLimit?: number;
  debitAccountTypes?: string[];
};

export const PRODUCTS: Product[] = [
  {
    code: "EVERYDAY_CHECKING",
    kind: "ACCOUNT",
    name: "Everyday Checking",
    shortName: "Everyday Checking",
    description: "No monthly fee checking with bill pay, mobile deposit and an optional debit card.",
    category: "personal",
    accountType: "CHECKING",
  },
  {
    code: "HIGH_YIELD_SAVINGS",
    kind: "ACCOUNT",
    name: "High-Yield Savings",
    shortName: "High-Yield Savings",
    description: "Earn 4.25% APY with no monthly maintenance fee and no minimum to open.",
    category: "personal",
    accountType: "SAVINGS",
    apy: 4.25,
  },
  {
    code: "MONEY_MARKET",
    kind: "ACCOUNT",
    name: "Premier Money Market",
    shortName: "Premier Money Market",
    description: "Check-writing money market earning 3.90% APY. $1,000 minimum to open.",
    category: "personal",
    accountType: "MONEY_MARKET",
    apy: 3.9,
  },
  {
    code: "CD_12",
    kind: "ACCOUNT",
    name: "12-Month Certificate of Deposit",
    shortName: "12-Month CD",
    description: "Lock in 4.00% APY for 12 months with a $1,000 minimum.",
    category: "personal",
    accountType: "CD",
    apy: 4.0,
  },
  {
    code: "BUSINESS_CHECKING",
    kind: "ACCOUNT",
    name: "Business Advantage Checking",
    shortName: "Business Adv Checking",
    description: "Checking built for small business — unlimited transactions and cash management tools.",
    category: "business",
    accountType: "BUSINESS_CHECKING",
  },
  {
    code: "BUSINESS_SAVINGS",
    kind: "ACCOUNT",
    name: "Business Advantage Savings",
    shortName: "Business Adv Savings",
    description: "Set aside operating reserves and earn 3.50% APY.",
    category: "business",
    accountType: "BUSINESS_SAVINGS",
    apy: 3.5,
  },
  {
    code: "DEBIT_VISA",
    kind: "DEBIT_CARD",
    name: "FMB Visa Debit Card",
    shortName: "Visa Debit",
    description: "Use a linked checking balance anywhere Visa is accepted. Issued after approval.",
    category: "cards",
    debitAccountTypes: ["CHECKING", "BUSINESS_CHECKING"],
    dailyLimit: 50_000,
  },
  {
    code: "CREDIT_CASH_REWARDS",
    kind: "CREDIT_CARD",
    name: "Business Advantage Cash Rewards",
    shortName: "Cash Rewards",
    description: "Earn 3% cash back on office supplies and 2% on gas. $10,000 credit line.",
    category: "cards",
    accountType: "CREDIT",
    creditLimit: 1_000_000,
    dailyLimit: 200_000,
  },
  {
    code: "CREDIT_TRAVEL",
    kind: "CREDIT_CARD",
    name: "FMB Travel Rewards Visa",
    shortName: "Travel Rewards",
    description: "Earn 2x points on travel and dining. $15,000 credit line.",
    category: "cards",
    accountType: "CREDIT",
    creditLimit: 1_500_000,
    dailyLimit: 250_000,
  },
];

export const PRODUCT_BY_CODE = Object.fromEntries(PRODUCTS.map((product) => [product.code, product])) as Record<string, Product>;

export function productByCode(code: string): Product | null {
  return PRODUCT_BY_CODE[code] ?? null;
}

export const DEPOSIT_ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "BUSINESS_CHECKING", "BUSINESS_SAVINGS", "MONEY_MARKET", "CD"] as const;
export const CHECKING_LIKE_TYPES = ["CHECKING", "BUSINESS_CHECKING"] as const;

export function isDepositAccountType(type: string): boolean {
  return (DEPOSIT_ACCOUNT_TYPES as readonly string[]).includes(type);
}

export function isCheckingLikeType(type: string): boolean {
  return (CHECKING_LIKE_TYPES as readonly string[]).includes(type);
}

export function isCreditAccountType(type: string): boolean {
  return type === "CREDIT";
}

export function accountTypeLabel(type: string): string {
  switch (type) {
    case "SAVINGS":
      return "Savings";
    case "BUSINESS_CHECKING":
      return "Business checking";
    case "BUSINESS_SAVINGS":
      return "Business savings";
    case "MONEY_MARKET":
      return "Money market";
    case "CD":
      return "Certificate of deposit";
    case "CREDIT":
      return "Credit card";
    default:
      return "Checking";
  }
}

export function productKindLabel(kind: string): string {
  if (kind === "DEBIT_CARD") return "Debit card";
  if (kind === "CREDIT_CARD") return "Credit card";
  return "Account";
}

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function allocateAccountNumber(db: { account: { findUnique: (args: any) => Promise<{ id: string } | null> } }, key: string, salt: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rand = mulberry32(hashSeed(`${key}:${salt}:${attempt}`));
    let num = "2";
    for (let i = 0; i < 11; i++) num += String(Math.floor(rand() * 10));
    const existing = await db.account.findUnique({ where: { accountNumber: num } });
    if (!existing) return num;
  }
  throw new Error("Could not allocate an account number");
}

export function allocateCardLast4(key: string, salt: string): string {
  const rand = mulberry32(hashSeed(`card:${key}:${salt}`));
  let last4 = "";
  for (let i = 0; i < 4; i++) last4 += String(Math.floor(rand() * 10));
  return last4;
}

export const ROUTING_NUMBER = "021000021";
