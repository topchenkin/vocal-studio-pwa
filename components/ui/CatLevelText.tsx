"use client";

/** Straight dash aligned to the letters, not a glyph from another font. */
export default function CatLevelText({
  label,
  className,
  as: Tag = "span",
}: {
  label: string;
  className?: string;
  as?: "span" | "h2" | "p";
}) {
  const dash = label.indexOf("-");
  if (dash < 0) {
    return <Tag className={className}>{label}</Tag>;
  }
  return (
    <Tag className={`inline-flex items-center ${className ?? ""}`}>
      {label.slice(0, dash)}
      <span
        aria-hidden
        className="mx-[0.14em] inline-block h-[0.11em] w-[0.4em] shrink-0 rounded-[1px] bg-current"
      />
      {label.slice(dash + 1)}
    </Tag>
  );
}
