"use client";

/** One text run so letters and hyphen stay on the same baseline. */
export default function CatLevelText({
  label,
  className,
  as: Tag = "span",
}: {
  label: string;
  className?: string;
  as?: "span" | "h2" | "p";
}) {
  return <Tag className={className}>{label}</Tag>;
}
