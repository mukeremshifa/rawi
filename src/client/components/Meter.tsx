import { cn } from '@/lib/utils';

/**
 * A horizontal proportion bar, and the only one in the app.
 *
 * ── What this may and may not draw ────────────────────────────────────────
 *
 * **It may never draw mastery.** Invariant 6: evidence is a described state,
 * never a number, and a filled bar labelled with a concept's name is a mastery
 * percentage wearing a different hat. The word "mastery" does not appear in
 * this app and neither does a number claiming to summarise what someone knows.
 *
 * What it may draw is a **count of discrete facts** the server actually holds:
 * "4 of 11 concepts have independent evidence" is four rows in an append-only
 * log, not an estimate, and a bar is a fair rendering of a fraction whose
 * numerator and denominator are both integers you could go and count. The
 * caller passes the count, not a score, and always renders the count in text
 * beside the bar — the bar is the quick read, the number is the truth.
 *
 * ── Colour, and the rule it obeys ─────────────────────────────────────────
 *
 * A meter's fill has nothing on top of it and sits directly on the page or a
 * card, which is the **mark** case — so the bands use `--evidence-*-mark`, not
 * the field ramp. The field ramp is for stops that carry a label. Under a
 * single ramp a light stop would be about 1.2:1 against the page: a bar you
 * cannot see, which rather defeats a bar.
 *
 * `neutral` is the default and is achromatic, because most proportions are
 * neither good nor bad and colouring one implies it is.
 */

export type MeterTone = 'neutral' | 'accent' | 'practicing' | 'independent' | 'retained';

const TONE_FILL: Record<MeterTone, string> = {
  neutral: 'bg-foreground/70',
  accent: 'bg-primary',
  practicing: 'bg-evidence-practicing-mark',
  independent: 'bg-evidence-independent-mark',
  retained: 'bg-evidence-retained-mark',
};

export function Meter({
  value,
  tone = 'neutral',
  className,
  label,
}: {
  /** 0–1. Clamped, so a caller's rounding error cannot overflow the track. */
  value: number;
  tone?: MeterTone;
  className?: string;
  /**
   * Accessible name. Required in spirit: a bare bar announces nothing, and
   * every caller has a name to hand because it is already rendering one.
   */
  label: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const percent = Math.round(clamped * 100);

  return (
    <div
      className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', className)}
      role="meter"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', TONE_FILL[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * The unmeasured case, drawn as absence rather than as zero.
 *
 * "We have not asked you yet" and "you got none of them" are the distinction
 * users most resent getting wrong, and a 0%-filled bar says the second while
 * meaning the first. A dashed empty track says the first. Nothing on screen is
 * a lie: unknown renders as unknown.
 */
export function EmptyMeter({ className, label }: { className?: string; label: string }) {
  return (
    <div
      className={cn('h-1.5 w-full rounded-full border border-dashed', className)}
      role="img"
      aria-label={label}
    />
  );
}
