import { toast as sonner } from 'sonner';
import { localSaveFailed } from '@/store/store';

/** An in-memory change must not be presented as durably saved. */
export const toast = Object.assign((...args: Parameters<typeof sonner>) => sonner(...args), sonner, {
  success: (...args: Parameters<typeof sonner.success>) => localSaveFailed()
    ? sonner.warning('Changes are only in memory', { description: 'Export a recovery copy or retry saving before reloading.' })
    : sonner.success(...args),
});
