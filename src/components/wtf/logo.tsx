import { cn } from "@/lib/utils";

/**
 * We the Future brand mark.
 * A rounded civic badge: three rising bars (people and progress) under a
 * check-marked banner, so it reads as colourful but still credible.
 */
export function WtfMark({
  className,
  title = "We the Future",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("size-9", className)}
    >
      <defs>
        <linearGradient id="wtf-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C4ECF" />
          <stop offset="55%" stopColor="#6A46D6" />
          <stop offset="100%" stopColor="#2E2A8F" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="64" height="64" rx="18" fill="url(#wtf-badge)" />

      {/* rising bars: three people standing together */}
      <g>
        <rect x="13" y="34" width="9" height="18" rx="4.5" fill="#3DD9A0" />
        <circle cx="17.5" cy="29" r="4.6" fill="#3DD9A0" />

        <rect x="27" y="27" width="10" height="25" rx="5" fill="#FFD166" />
        <circle cx="32" cy="21.5" r="5.2" fill="#FFD166" />

        <rect x="42" y="34" width="9" height="18" rx="4.5" fill="#FF7A5A" />
        <circle cx="46.5" cy="29" r="4.6" fill="#FF7A5A" />
      </g>

      {/* verified tick on the tallest figure */}
      <circle cx="46" cy="17" r="9.5" fill="#FFFFFF" />
      <path
        d="M41.6 17.2l3.1 3.2 5.8-6.1"
        fill="none"
        stroke="#2E2A8F"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WtfLogo({
  className,
  subtitle = "Public projects, checked against official records",
  showSubtitle = true,
}: {
  className?: string;
  subtitle?: string;
  showSubtitle?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <WtfMark />
      <span>
        <span className="block text-sm font-semibold leading-tight tracking-tight">
          We the Future
        </span>
        {showSubtitle ? (
          <span className="block text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
