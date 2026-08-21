"use client";

/**
 * Words stay on one baseline (display font). The dash is a straight bar
 * lifted from that baseline into the middle of the letters — not the cap line.
 */
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
        className="mx-[0.12em] inline-block h-[0.1em] w-[0.4em] translate-y-[-0.22em] rounded-[1px] bg-current"
      />
      <span className="inline-block translate-y-[-0.08em]">
        {label.slice(dash + 1)}
      </span>
    </Tag>
  );
}
