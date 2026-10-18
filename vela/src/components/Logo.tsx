import Image from "next/image";

/** FMB compass-and-wordmark lockup. `variant`/`compact` retain the call-site API. */
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
        src={onDark ? "/fmb-logo-white.svg" : "/fmb-logo.svg"}
        alt="FMB"
        width={195}
        height={30}
        priority
        className={compact ? "h-6 w-auto" : "h-[30px] w-auto"}
      />
    </span>
  );
}
