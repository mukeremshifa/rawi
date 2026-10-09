// Response shapes the client reads. Import these with `import type` only.
import type { aiStatus, viewOperation } from './services/ai/operations';
import type { ReplyEvent } from './services/ai/tutor';
import type { plannerView, progress } from './services/planning';
import type { notifications, search } from './services/support';

export type AiOperationView = Awaited<ReturnType<typeof viewOperation>>;
export type AiStatusView = Awaited<ReturnType<typeof aiStatus>>;
export type { ReplyEvent };
export type PlannerView = Awaited<ReturnType<typeof plannerView>>;
export type ProgressView = Awaited<ReturnType<typeof progress>>;
export type SearchResults = Awaited<ReturnType<typeof search>>;
export type NotificationsView = Awaited<ReturnType<typeof notifications>>;
