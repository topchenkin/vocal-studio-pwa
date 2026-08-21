"use client";

/** Display fonts slant a hyphen; Inter keeps a straight dash. */
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
    <Tag className={className}>
      {label.slice(0, dash)}
      <span className="inline font-sans font-semibold not-italic">-</span>
      {label.slice(dash + 1)}
    </Tag>
  );
}
