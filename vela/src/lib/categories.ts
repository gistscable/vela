const META: Record<string, { label: string; color: string }> = {
  INCOME: { label: "Income", color: "#0e7c4a" },
  HOUSING: { label: "Housing", color: "#002855" },
  FOOD: { label: "Food & dining", color: "#d8232a" },
  TRANSPORT: { label: "Transportation", color: "#e07b39" },
  SHOPPING: { label: "Shopping", color: "#7b5ea7" },
  ENTERTAINMENT: { label: "Entertainment", color: "#2f80ed" },
  UTILITIES: { label: "Utilities", color: "#b7791f" },
  HEALTH: { label: "Health", color: "#219653" },
  TRANSFER: { label: "Transfers", color: "#5b7a99" },
  SAVINGS: { label: "Savings", color: "#0f766e" },
  OTHER: { label: "Other", color: "#8a8f98" },
};

export function categoryMeta(category: string): { label: string; color: string } {
  return META[category] ?? META.OTHER;
}
