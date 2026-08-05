import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  className?: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}

const titleSize = {
  sm: "text-base sm:text-lg",
  md: "text-lg sm:text-xl",
  lg: "text-xl sm:text-2xl",
} as const;

/**
 * Unique — gold, Vocal — purple accent, Studio — same gradient as «профи».
 */
export default function BrandWordmark({
  className = "",
  subtitle,
  size = "md",
}: BrandWordmarkProps) {
  return (
    <div className={className}>
      <p
        className={cn(
          "font-display font-semibold leading-tight tracking-wide",
          titleSize[size]
        )}
      >
        <span className="text-studio-gold">Unique</span>{" "}
        <span className="text-studio-accent">Vocal</span>{" "}
        <span className="text-gradient">Studio</span>
      </p>
      {subtitle ? (
        <p className="text-[10px] text-studio-muted sm:text-xs">{subtitle}</p>
      ) : null}
    </div>
  );
}
