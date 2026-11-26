import * as React from 'react';

import { controlClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Textarea: multi-line text that grows with its content. Wrap in Field. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, 'field-sizing-content h-auto min-h-20 py-1.5 leading-relaxed', className)}
      {...props}
    />
  );
}

export { Textarea };
