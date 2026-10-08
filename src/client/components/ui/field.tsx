import * as React from 'react';
import { Slot } from 'radix-ui';
import { AlertCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Field: a label, the control, an optional description and an error, wired
 * with `id`, `aria-describedby` and `aria-invalid`. Every form control goes in
 * one. The control is the single child. `layout="row"` puts the label beside
 * the control, for settings pages.
 */
function Field({ label, description, error, required, optional, layout = 'stack', className, children, htmlFor }: {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Marks a field the learner can leave empty, when most others are required. */
  optional?: boolean;
  layout?: 'stack' | 'row';
  className?: string;
  /** Use when the child manages its own id, such as a Select trigger. */
  htmlFor?: string;
  children: React.ReactElement;
}) {
  const generated = React.useId();
  const id = htmlFor ?? generated;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const labelNode = (
    <label htmlFor={id} className="text-sm font-medium">
      {label}
      {required && <span aria-hidden className="text-muted-foreground"> *</span>}
      {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
    </label>
  );
  const control = (
    <Slot.Root id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} aria-required={required || undefined}>
      {children}
    </Slot.Root>
  );
  const notes = <>
    {description && <p id={descriptionId} className="text-muted-foreground text-sm">{description}</p>}
    {error && <FieldError id={errorId}>{error}</FieldError>}
  </>;
  if (layout === 'row') {
    return (
      <div data-slot="field" className={cn('grid gap-x-gutter gap-y-1.5 py-snug sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start', className)}>
        <div className="flex flex-col gap-0.5 sm:pt-1.5">{labelNode}{description && <p id={descriptionId} className="text-muted-foreground text-sm">{description}</p>}</div>
        <div className="flex min-w-0 flex-col gap-1.5">{control}{error && <FieldError id={errorId}>{error}</FieldError>}</div>
      </div>
    );
  }
  return (
    <div data-slot="field" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {labelNode}
      {control}
      {notes}
    </div>
  );
}

/** An inline error under a control, or under a group of controls. */
function FieldError({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <p id={id} className={cn('text-danger-text flex items-start gap-1 text-sm', className)}>
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A labelled group of related controls, such as a list of checkboxes. */
function FieldSet({ legend, description, children, className }: { legend: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      {description && <p className="text-muted-foreground -mt-1 mb-1 text-sm">{description}</p>}
      {children}
    </fieldset>
  );
}

export { Field, FieldError, FieldSet };
