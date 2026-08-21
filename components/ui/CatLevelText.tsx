"use client";

/** Straight short bar, vertically centered; both words stay on one baseline. */
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
      <span
        aria-hidden
        className="mx-[0.08em] inline-block h-[0.08em] w-[0.36em] rounded-[1px] bg-current align-middle"
      />
      {label.slice(dash + 1)}
    </Tag>
  );
}
