import type { ReadDb, SocketDb } from '../../db/client';
import type { PolicySection } from '../../../shared/domain/agent';

export interface LanguageSignal {
  count: number;
  sections: PolicySection[];
  glossaryReady: boolean;
}

/** Language signals per course. Language support is not recorded yet, so there are none. */
export async function languageSignals(
  _db: ReadDb | SocketDb,
  _workspaceId: string,
  _timezone: string,
): Promise<Map<string, LanguageSignal>> {
  return new Map();
}
