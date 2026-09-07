import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cormorant Garamond (font-display) draws a slanted hyphen. Unicode MINUS
 * SIGN (U+2212) can also look like a slash. The proven studio fix is a
 * short CSS bar, not a glyph from the display face.
 */
export function StraightHyphen({ className }: { className?: string }) {
  return (
    <>
      <span className="sr-only">-</span>
      <span
        aria-hidden
        className={cn(
          "mx-[0.08em] inline-block h-[0.08em] w-[0.36em] rounded-[1px] bg-current align-middle",
          className
        )}
      />
    </>
  );
}

const UI_DASHES = new Set(["-", "−", "–"]);

/** Hyphen-minus, minus sign, en-dash → straight bar. Em-dash (—) stays. */
export function straightDashNodes(text: string): ReactNode {
  const parts = text.split(/([-−–])/);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    UI_DASHES.has(part) ? (
      <StraightHyphen key={index} />
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}
