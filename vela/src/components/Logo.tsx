import Image from "next/image";

/**
 * FMB brand lockup. The compass mark and the "FMB / EST. 1907" wordmark are
 * baked into a single PNG (public/fmb-logo.png, rendered at 3x), so the brand
 * name never appears as readable text in the DOM.
 * Source of truth for colors/typography lives in the render script history;
 * `variant`/`compact` keep the pre-existing call-site API.
 */
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

  return (
    <span className={`inline-flex items-center ${compact ? "gap-1.5" : "gap-2.5"} ${className}`}>
      <Image
        src={onDark ? "/fmb-logo-white.png" : "/fmb-logo.png"}
        alt="FMB"
        width={112}
        height={30}
        priority
        className={compact ? "h-6 w-auto" : "h-[30px] w-auto"}
      />
    </span>
  );
}
