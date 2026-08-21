"use client";

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Unified brand mark — same artwork as PWA icons (/public/icons).
 * Colors: Unique gold, Vocal purple, Studio purple→gold gradient.
 */
export default function Logo({ className = "", size = 48 }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/logo.png?v=42"
      alt="Unique Vocal Studio"
      width={size}
      height={size}
      className={`rounded-[22%] object-cover ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
