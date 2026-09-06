import type { SocialPlatform } from "@/lib/types";

// Simplified monochrome glyphs (currentColor, stroke-style) matching this
// app's existing hand-inlined-SVG icon convention (see src/lib/nav.ts) rather
// than pulling in a brand-icon library dependency.
const PATHS: Record<SocialPlatform, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  facebook: (
    <path d="M15 4h-2a4 4 0 00-4 4v3H6v3h3v6h3v-6h2.5l.5-3H12V8a1 1 0 011-1h2V4z" />
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="7.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M7.5 11v6M12 17v-3.5a2 2 0 014 0V17M12 13.5V11" />
    </>
  ),
  twitter: (
    <path d="M4 4l7.2 9.6L4.4 20H7l5.6-5.9L17 20h3l-7.5-10L19.5 4H17l-5.2 5.5L7 4z" />
  ),
  tiktok: (
    <path d="M14 4v9.5a3.5 3.5 0 11-3-3.46V7.2A6.5 6.5 0 1017 10.2V8.8a4.5 4.5 0 01-2.7-1.1A4.4 4.4 0 0113 4z" />
  ),
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </>
  ),
};

export function PlatformIcon({
  platform,
  className = "h-4 w-4",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[platform] ?? PATHS.other}
    </svg>
  );
}
