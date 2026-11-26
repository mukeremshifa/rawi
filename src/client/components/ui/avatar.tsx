import { Avatar as AvatarPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Avatar: the learner's picture, falling back to initials in neutral grey.
 * Also the monogram tile for a course when a visual handle is needed.
 */
function Avatar({
  name,
  src,
  size = 'md',
  shape = 'circle',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square';
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => [...part][0] ?? '')
      .join('')
      .toUpperCase() || '?';
  return (
    <AvatarPrimitive.Root
      className={cn(
        'bg-gray-5 text-gray-11 inline-flex shrink-0 items-center justify-center overflow-hidden font-medium select-none',
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        size === 'sm' && 'size-5 text-[10px]',
        size === 'md' && 'size-6 text-xs',
        size === 'lg' && 'size-8 text-sm',
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      )}
      <AvatarPrimitive.Fallback delayMs={src ? 400 : 0} aria-hidden>
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { Avatar };
