/**
 * Small illustrations for empty states.
 *
 * Inline SVG rather than emoji or an image file: emoji look different on every
 * machine, and an image file would be a request. These are drawn in the palette
 * tokens, so they stay in tune with the rest of the app automatically.
 *
 * Deliberately rounded everywhere — no sharp corners, no hard outlines. Each one
 * is decorative, so it carries aria-hidden and the empty state supplies the words.
 */

export type IllustrationName = 'capsule' | 'rosette' | 'basket' | 'microphone' | 'lookingGlass';

const SHARED = {
  width: 96,
  height: 96,
  viewBox: '0 0 96 96',
  fill: 'none',
  'aria-hidden': true,
} as const;

/** An open, empty gacha capsule. For "no questions in the bank". */
function Capsule() {
  return (
    <svg {...SHARED}>
      {/* Bottom half, sitting open */}
      <path
        d="M22 52a26 26 0 0 0 52 0Z"
        fill="var(--color-behavioural)"
        stroke="var(--color-behavioural-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Top half, tipped off to the side */}
      <path
        d="M30 34a22 22 0 0 1 44 0Z"
        fill="var(--color-tech)"
        stroke="var(--color-tech-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        transform="rotate(-18 52 34)"
      />
      {/* A gentle shine, so it reads as plastic */}
      <ellipse cx="38" cy="60" rx="5" ry="3" fill="#fff" opacity="0.55" />
      {/* Ground shadow */}
      <ellipse cx="48" cy="80" rx="26" ry="4" fill="var(--color-ink)" opacity="0.08" />
    </svg>
  );
}

/** A rosette with a blank centre. For badges not yet earned. */
function Rosette() {
  return (
    <svg {...SHARED}>
      <path
        d="M40 58 30 84l12-6 6 10 6-10 12 6-10-26Z"
        fill="var(--color-peach)"
        opacity="0.75"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="40" r="22" fill="var(--color-gold)" opacity="0.5" />
      <circle
        cx="48"
        cy="40"
        r="22"
        stroke="var(--color-gold-deep)"
        strokeWidth="2.5"
        strokeDasharray="5 5"
        opacity="0.8"
      />
      <circle cx="48" cy="40" r="11" fill="var(--color-cream)" />
      <ellipse cx="41" cy="34" rx="4" ry="2.5" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/** An empty basket. For a collection with nothing in it yet. */
function Basket() {
  return (
    <svg {...SHARED}>
      <path
        d="M20 42h56l-6 32a6 6 0 0 1-6 5H32a6 6 0 0 1-6-5Z"
        fill="var(--color-tech)"
        stroke="var(--color-tech-deep)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Weave */}
      <path d="M34 50v28M48 50v29M62 50v28" stroke="var(--color-tech-deep)" strokeWidth="2" opacity="0.45" />
      {/* Handle */}
      <path
        d="M32 42a16 16 0 0 1 32 0"
        stroke="var(--color-behavioural-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <ellipse cx="48" cy="86" rx="24" ry="3.5" fill="var(--color-ink)" opacity="0.08" />
    </svg>
  );
}

/** A little microphone. For "nothing recorded yet". */
function Microphone() {
  return (
    <svg {...SHARED}>
      <rect
        x="37"
        y="18"
        width="22"
        height="38"
        rx="11"
        fill="var(--color-behavioural)"
        stroke="var(--color-behavioural-deep)"
        strokeWidth="2.5"
      />
      <path
        d="M29 46a19 19 0 0 0 38 0"
        stroke="var(--color-peach-deep)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M48 65v11" stroke="var(--color-peach-deep)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M36 78h24" stroke="var(--color-peach-deep)" strokeWidth="3.5" strokeLinecap="round" />
      {/* Two soft sound arcs, suggesting speaking out loud */}
      <path
        d="M74 30a20 20 0 0 1 0 22M20 30a20 20 0 0 0 0 22"
        stroke="var(--color-tech-deep)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <ellipse cx="43" cy="27" rx="3" ry="5" fill="#fff" opacity="0.5" />
    </svg>
  );
}

/** A magnifying glass. For a filter that matched nothing. */
function LookingGlass() {
  return (
    <svg {...SHARED}>
      <circle cx="43" cy="41" r="21" fill="var(--color-tech)" opacity="0.45" />
      <circle cx="43" cy="41" r="21" stroke="var(--color-tech-deep)" strokeWidth="3.5" />
      <path
        d="M59 57 76 74"
        stroke="var(--color-peach-deep)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <ellipse cx="36" cy="34" rx="5" ry="3" fill="#fff" opacity="0.75" />
    </svg>
  );
}

const ILLUSTRATIONS: Record<IllustrationName, () => JSX.Element> = {
  capsule: Capsule,
  rosette: Rosette,
  basket: Basket,
  microphone: Microphone,
  lookingGlass: LookingGlass,
};

export function Illustration({ name, className = '' }: { name: IllustrationName; className?: string }) {
  const Drawing = ILLUSTRATIONS[name];
  return (
    <span className={`inline-block ${className}`} aria-hidden="true">
      <Drawing />
    </span>
  );
}
