export function Logo({
  variant = "full",
  className = "",
  compact = false,
}: {
  variant?: "full" | "white" | "stacked";
  className?: string;
  compact?: boolean;
}) {
  const onDark = variant === "white";
  const wordColor = onDark ? "text-white" : "text-bank-navy";
  const subColor = onDark ? "text-white/80" : "text-bank-red";

  return (
    <span className={`inline-flex items-center ${compact ? "gap-1.5" : "gap-2.5"} ${className}`}>
      {/* Meridian compass — a distinct geometric mark for the First Meridian brand */}
      <svg width={compact ? 27 : 34} height={compact ? 24 : 30} viewBox="0 0 34 30" fill="none" aria-hidden>
        <path d="M17 1.5 31.5 15 17 28.5 2.5 15 17 1.5Z" fill={onDark ? "#FFFFFF" : "#D8232A"} />
        <path d="m17 5.2 4.1 9.8-4.1 9.8L12.9 15 17 5.2Z" fill={onDark ? "#002855" : "#FFFFFF"} />
        <path d="M7.5 15h19" stroke={onDark ? "#002855" : "#D8232A"} strokeWidth="1.2" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`${compact ? "text-[13.5px]" : "text-[17px]"} font-bold tracking-tight ${wordColor}`}>
          First Meridian<span className="font-normal"> Bank</span>
        </span>
        <span className={`mt-[3px] ${compact ? "text-[6.5px] tracking-[0.28em]" : "text-[8.5px] tracking-[0.32em]"} font-semibold uppercase ${subColor}`}>
          Est. 1907
        </span>
      </span>
    </span>
  );
}
