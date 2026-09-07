"use client";

import { straightDashNodes } from "@/components/ui/StraightDashText";

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
  return <Tag className={className}>{straightDashNodes(label)}</Tag>;
}
