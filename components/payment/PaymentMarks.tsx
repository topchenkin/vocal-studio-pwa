function SbpMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g transform="translate(16 16) rotate(45)">
        <rect x="-10.2" y="-10.2" width="9.2" height="9.2" rx="1.6" fill="#00AEEF" />
        <rect x="1" y="-10.2" width="9.2" height="9.2" rx="1.6" fill="#EC008C" />
        <rect x="-10.2" y="1" width="9.2" height="9.2" rx="1.6" fill="#00A651" />
        <rect x="1" y="1" width="9.2" height="9.2" rx="1.6" fill="#7B2D8E" />
      </g>
    </svg>
  );
}

function MirMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="48" height="32" rx="5" fill="#0D9072" />
      <text
        x="24"
        y="21.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="13"
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="0.6"
      >
        МИР
      </text>
    </svg>
  );
}

function VisaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="48" height="32" rx="5" fill="#1A1F71" />
      <text
        x="24"
        y="21"
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
        fontWeight="800"
        fontFamily="Arial, Helvetica, sans-serif"
        fontStyle="italic"
        letterSpacing="1.2"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="48" height="32" rx="5" fill="#1A1A1A" />
      <circle cx="20" cy="16" r="8" fill="#EB001B" />
      <circle cx="28" cy="16" r="8" fill="#F79E1B" />
      <path
        d="M24 9.7a8 8 0 0 1 0 12.6 8 8 0 0 1 0-12.6Z"
        fill="#FF5F00"
      />
    </svg>
  );
}

export default function PaymentMarks() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">СБП, МИР, Visa, Mastercard</span>
      <SbpMark className="h-9 w-9" />
      <MirMark className="h-8 w-12" />
      <VisaMark className="h-8 w-12" />
      <MastercardMark className="h-8 w-12" />
    </div>
  );
}

export { SbpMark };
