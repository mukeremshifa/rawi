import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { Calendar } from '@/components/ui/calendar';
import { controlClass } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * DateField: one calendar date as an ISO string (YYYY-MM-DD), picked from a
 * Calendar popover and shown in the learner's locale. Empty is `''`.
 */
function DateField({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  clearable,
  min,
  max,
  disabled,
  className,
  id,
  ...aria
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const label = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          {...aria}
          className={cn(controlClass, 'flex w-48 max-w-full items-center gap-2 text-left', className)}
        >
          <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className={cn('truncate', !label && 'text-muted-foreground')}>{label ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          value={value || null}
          min={min}
          max={max}
          onSelect={iso => {
            onValueChange(iso);
            setOpen(false);
          }}
        />
        {clearable && value && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground mt-2 text-sm"
            onClick={() => {
              onValueChange('');
              setOpen(false);
            }}
          >
            Clear date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { DateField };
