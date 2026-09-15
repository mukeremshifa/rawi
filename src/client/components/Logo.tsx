import { cn } from '@/lib/utils';

/**
 * The Rawi mark: an open quotation form with a single node inside it.
 *
 * *Rawi* (راوي) is the one who carries an account and passes it on, so the mark
 * is the shape of carrying something — an open bracket, not a closed box — with
 * one point held inside it. A concept, being kept.
 *
 * Three primitives, which is what lets it survive being shrunk to a favicon or
 * printed in one colour. **The node is the accent and the bracket is not**: the
 * bracket is structure and the node is the thing structure exists to hold, and
 * the palette allows exactly one colour to mean anything (rule 2 in
 * `globals.css`). The accent here is ink-side — `--primary` is dark enough to
 * be a mark on paper, which is the rule Rawi inverted from the donor palette.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('size-6', className)}
      role="img"
      aria-label="Rawi"
    >
      {/* The bracket: structure, in ink. Round joins so it reads as drawn
          rather than as a chart axis. */}
      <path
        d="M15.5 3.5 A 10.5 10.5 0 0 0 15.5 20.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19.5 6.5 A 6.5 6.5 0 0 0 19.5 17.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* The node: the one accent in the mark. */}
      <circle cx="9" cy="12" r="2.75" className="fill-primary" />
    </svg>
  );
}

/** The mark with the name beside it. The name is set in the serif face. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-tight', className)}>
      <LogoMark className="size-5" />
      <span className="font-serif text-lg leading-none tracking-tight">Rawi</span>
    </span>
  );
}
