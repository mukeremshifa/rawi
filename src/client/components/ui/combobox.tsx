import * as React from 'react';
import { Command } from 'cmdk';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';

import { controlClass } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ComboboxOption = { value: string; label: string; hint?: string; group?: string };

type Common = {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

/**
 * Combobox: a searchable list, for topics, materials and timezones. Single
 * by default. `multiple` picks several and shows a count. For a short fixed
 * list, use Select.
 */
function Combobox(
  props: Common &
    (
      | { multiple?: false; value: string; onValueChange: (value: string) => void }
      | { multiple: true; value: string[]; onValueChange: (value: string[]) => void }
    ),
) {
  const {
    options,
    placeholder = 'Choose',
    searchPlaceholder = 'Search',
    empty = 'No matches.',
    disabled,
    className,
    id,
    multiple,
  } = props;
  const [open, setOpen] = React.useState(false);
  const values = multiple ? props.value : props.value ? [props.value] : [];
  const label = multiple
    ? values.length === 0
      ? null
      : values.length === 1
        ? options.find(o => o.value === values[0])?.label
        : `${values.length} selected`
    : options.find(o => o.value === props.value)?.label;
  const groups = [...new Set(options.map(o => o.group ?? ''))];
  const pick = (value: string) => {
    if (props.multiple)
      props.onValueChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
    else {
      props.onValueChange(value);
      setOpen(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label={props['aria-label']}
          aria-describedby={props['aria-describedby']}
          aria-invalid={props['aria-invalid']}
          className={cn(controlClass, 'flex items-center justify-between gap-2 text-left', className)}
        >
          <span className={cn('truncate', !label && 'text-muted-foreground')}>{label ?? placeholder}</span>
          <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command loop className="flex flex-col">
          <Command.Input
            placeholder={searchPlaceholder}
            className="border-b bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="text-muted-foreground px-2 py-4 text-center text-sm">{empty}</Command.Empty>
            {groups.map(group => (
              <Command.Group
                key={group}
                heading={group || undefined}
                className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs"
              >
                {options
                  .filter(o => (o.group ?? '') === group)
                  .map(option => (
                    <Command.Item
                      key={option.value}
                      value={`${option.label} ${option.hint ?? ''} ${option.value}`}
                      onSelect={() => pick(option.value)}
                      className="data-[selected=true]:bg-accent flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-base outline-none select-none"
                    >
                      <CheckIcon
                        className={cn('size-3.5 shrink-0', values.includes(option.value) ? 'opacity-100' : 'opacity-0')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint && <span className="text-muted-foreground shrink-0 text-sm">{option.hint}</span>}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
          {multiple && values.length > 0 && (
            <button
              type="button"
              onClick={() => props.onValueChange([])}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 border-t px-3 py-2 text-sm"
            >
              <XIcon className="size-3.5" aria-hidden />
              Clear selection
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };
