import { cn } from "@/lib/utils";

export default function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "gold" | "success" | "muted";
  className?: string;
}) {
  const variants = {
    default: "bg-studio-accent/20 text-studio-accent-light ring-studio-accent/30",
    gold: "bg-studio-gold/20 text-studio-gold ring-studio-gold/30",
    success: "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30",
    muted: "bg-studio-border text-studio-muted ring-studio-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
