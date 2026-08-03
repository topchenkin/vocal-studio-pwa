"use client";

/**
 * Logo component for Unique Vocal Studio.
 * Set USE_EXTERNAL_LOGO to true when /public/logo.svg is ready.
 */
const USE_EXTERNAL_LOGO = false;

interface LogoProps {
  className?: string;
  size?: number;
}

export default function Logo({ className = "", size = 44 }: LogoProps) {
  if (USE_EXTERNAL_LOGO) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.svg"
        alt="Unique Vocal Studio"
        width={size}
        height={size}
        className={className}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Unique Vocal Studio"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="44" y2="44">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="waveGrad" x1="8" y1="20" x2="36" y2="20">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <rect
        width="44"
        height="44"
        rx="12"
        fill="url(#logoGrad)"
        fillOpacity="0.15"
      />
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="43"
        rx="11.5"
        stroke="url(#logoGrad)"
        strokeOpacity="0.4"
      />
      {/* Voice wave */}
      <path
        d="M8 22 C10 14, 14 14, 16 22 C18 30, 22 30, 24 22 C26 14, 30 14, 32 22 C34 30, 36 30, 36 22"
        stroke="url(#waveGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Musical note stem */}
      <line
        x1="34"
        y1="12"
        x2="34"
        y2="24"
        stroke="#e9d5ff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="34" cy="26" rx="3" ry="2.5" fill="#fbbf24" transform="rotate(-20 34 26)" />
    </svg>
  );
}
