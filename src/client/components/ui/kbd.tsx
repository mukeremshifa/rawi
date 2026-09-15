import { cn } from '@/lib/utils';

/**
 * A key, drawn as a key.
 *
 * Practice, the review gate and the staging rows all advertise shortcuts, and
 * until now each did it with a bare `<kbd className="opacity-60">` — three
 * spellings of the same idea that drifted apart. One primitive, in the mono
 * face, so a shortcut looks the same wherever it is offered (SPEC §8.4: the
 * keyboard path is a requirement, and a hint nobody notices is not one).
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center',
        'rounded-sm border px-1 font-mono text-[0.6875rem] leading-none font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
