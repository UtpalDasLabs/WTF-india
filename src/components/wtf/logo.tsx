import { cn } from "@/lib/utils";

/**
 * We the Future brand mark.
 * A rounded civic badge that literally spells WTF in three colours, drawn as
 * thick rounded strokes so the letters stay readable at 24px in the header and
 * as an app icon. The small tick keeps the "checked against records" promise.
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
          <stop offset="0%" stopColor="#2B2E8C" />
          <stop offset="52%" stopColor="#4C4ECF" />
          <stop offset="100%" stopColor="#7A3FD1" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="64" height="64" rx="17" fill="url(#wtf-badge)" />

      {/* WTF, drawn as strokes so it reads at icon size */}
      <g
        fill="none"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* W */}
        <path d="M7 20.5 L12.4 39 L17.8 28.5 L23.2 39 L28.6 20.5" stroke="#3DD9A0" />
        {/* T */}
        <path d="M31.5 20.5 H45.5" stroke="#FFC93C" />
        <path d="M38.5 20.5 V39" stroke="#FFC93C" />
        {/* F */}
        <path d="M50 39 V20.5 H60" stroke="#FF7A5A" />
        <path d="M50 29.5 H57.5" stroke="#FF7A5A" />
      </g>

      {/* verified tick sitting on a bright civic bar */}
      <rect x="7" y="47.5" width="33" height="5.4" rx="2.7" fill="#FFFFFF" opacity="0.9" />
      <circle cx="51.5" cy="50" r="7.8" fill="#3DD9A0" />
      <path
        d="M48 50.2l2.8 2.8 4.7-5.6"
        fill="none"
        stroke="#12275A"
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
