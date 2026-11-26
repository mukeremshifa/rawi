import { MinusIcon, PlusIcon } from 'lucide-react';

import { controlClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * NumberField: a bounded whole number, such as a question count or minutes,
 * with step buttons. `value` is null while the field is empty, so a learner
 * can clear it and type without the field snapping back.
 */
function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  className,
  disabled,
  id,
  ...aria
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** A unit shown inside the field, such as "min". */
  suffix?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const bump = (direction: 1 | -1) => onValueChange(clamp((value ?? min ?? 0) + direction * step));
  return (
    <div className={cn('flex w-36 max-w-full items-stretch', className)}>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={value ?? ''}
          {...aria}
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? undefined}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d-]/g, '');
            onValueChange(raw === '' || raw === '-' ? null : Number(raw));
          }}
          onBlur={() => {
            if (value !== null && clamp(value) !== value) onValueChange(clamp(value));
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              bump(1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              bump(-1);
            }
          }}
          className={cn(controlClass, 'tabular rounded-r-none', suffix && 'pr-10')}
        />
        {suffix && (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || (value !== null && min !== undefined && value <= min)}
        onClick={() => bump(-1)}
        className="border-input bg-card hover:bg-accent text-muted-foreground flex w-7 items-center justify-center border-y border-l disabled:opacity-40"
      >
        <MinusIcon className="size-3.5" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || (value !== null && max !== undefined && value >= max)}
        onClick={() => bump(1)}
        className="border-input bg-card hover:bg-accent text-muted-foreground flex w-7 items-center justify-center rounded-r-md border disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  );
}

export { NumberField };
