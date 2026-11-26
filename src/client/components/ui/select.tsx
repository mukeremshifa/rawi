import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { controlClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean };

/** Radix forbids an empty value, so "none" travels as this sentinel. */
const EMPTY = '__empty__';

/**
 * Select: choose one of a short, fixed list (under about fifteen). For long
 * or searchable lists, such as topics, materials or timezones, use Combobox.
 * For two to four options seen at once, use SegmentedControl. An option with
 * value `''` is allowed and means "none" or "all".
 */
function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Choose',
  disabled,
  className,
  size = 'md',
  id,
  ...aria
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const selected = options.find(o => o.value === value);
  return (
    <SelectPrimitive.Root
      value={value === '' ? EMPTY : value}
      onValueChange={v => onValueChange(v === EMPTY ? '' : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        {...aria}
        className={cn(
          controlClass,
          'flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted-foreground',
          size === 'sm' && 'h-7 text-sm',
          className,
        )}
      >
        <span className="truncate">
          {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="ui-pop bg-popover text-popover-foreground z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border shadow-overlay"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map(option => (
              <SelectPrimitive.Item
                key={option.value || EMPTY}
                value={option.value || EMPTY}
                disabled={option.disabled}
                className="data-[highlighted]:bg-accent relative flex cursor-default items-start gap-2 rounded-md py-1.5 pr-2 pl-7 text-base outline-none select-none data-[disabled]:opacity-50"
              >
                <span className="absolute top-2 left-2 flex size-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-3.5" aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <span className="flex flex-col">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description && <span className="text-muted-foreground text-sm">{option.description}</span>}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select };
