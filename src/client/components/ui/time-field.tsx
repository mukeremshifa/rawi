import { controlClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const toText = (minutes: number) =>
  minutes >= 1440
    ? '00:00'
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * TimeField: a time of day as minutes after midnight. Uses the platform time
 * input, which gives every learner their own clock format and a native picker
 * on phones. `endOfDay` reads midnight as 1440, for the end of a window.
 */
function TimeField({
  value,
  onValueChange,
  endOfDay,
  disabled,
  className,
  id,
  ...aria
}: {
  value: number | null;
  onValueChange: (minutes: number | null) => void;
  endOfDay?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  return (
    <input
      id={id}
      type="time"
      disabled={disabled}
      {...aria}
      value={value === null ? '' : toText(value)}
      onChange={e => {
        if (!e.target.value) {
          onValueChange(null);
          return;
        }
        const [h, m] = e.target.value.split(':').map(Number);
        const minutes = h! * 60 + m!;
        onValueChange(endOfDay && minutes === 0 ? 1440 : minutes);
      }}
      className={cn(controlClass, 'tabular w-32', className)}
    />
  );
}

export { TimeField };
