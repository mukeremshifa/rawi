import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  AddSourceInput,
  AdvanceStageInput,
  ApiClient,
  AskInput,
  AskResponse,
  Concept,
  ConceptEvidence,
  CreateWorkspaceInput,
  EvidenceSummary,
  Job,
  Page,
  Profile,
  Quota,
  Readiness,
  Session,
  SessionCommandInput,
  Source,
  SourceChunk,
  StudyPlan,
  SubmitResponseInput,
  Workspace,
} from '@shared/contract.ts';

import { useApi } from './provider.tsx';

/**
 * Query keys and hooks, in one file, so cache invalidation is auditable.
 *
 * ── Keys are hierarchical and always start with the workspace ─────────────
 *
 * `['workspace', id, 'concepts']` rather than `['concepts', id]`. It costs
 * nothing and it buys the thing that matters: invalidating everything about one
 * workspace is a single prefix, and a key that does not name its workspace
 * cannot exist by construction — the same argument the contract makes about
 * `workspaceId` being a required first parameter.
 *
 * ── What a session mutation invalidates, and why it is so much ────────────
 *
 * A submitted response can change the concept's evidence state, the workspace's
 * due count, the study plan and the evidence summary. Invalidating the whole
 * workspace prefix is a handful of refetches against a small dataset, and the
 * alternative — enumerating what each command touches — is a list that goes
 * stale the first time a server rule changes. The cheap correct thing beats the
 * clever fragile thing at this size.
 */

export const keys = {
  profile: ['profile'] as const,
  quota: ['quota'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  sources: (id: string) => ['workspace', id, 'sources'] as const,
  source: (id: string, sourceId: string) => ['workspace', id, 'source', sourceId] as const,
  chunks: (id: string, sourceId: string) =>
    ['workspace', id, 'source', sourceId, 'chunks'] as const,
  concepts: (id: string) => ['workspace', id, 'concepts'] as const,
  concept: (id: string, conceptId: string) =>
    ['workspace', id, 'concept', conceptId] as const,
  readiness: (id: string, conceptId: string) =>
    ['workspace', id, 'concept', conceptId, 'readiness'] as const,
  evidence: (id: string, conceptId: string) =>
    ['workspace', id, 'concept', conceptId, 'evidence'] as const,
  summary: (id: string) => ['workspace', id, 'evidence'] as const,
  plan: (id: string) => ['workspace', id, 'plan'] as const,
  session: (id: string, sessionId: string) =>
    ['workspace', id, 'session', sessionId] as const,
  reviews: (id: string) => ['workspace', id, 'reviews'] as const,
  job: (id: string, jobId: string) => ['workspace', id, 'job', jobId] as const,
};

export function useProfile(timezone: string): UseQueryResult<Profile> {
  const api = useApi();
  return useQuery({ queryKey: keys.profile, queryFn: () => api.getProfile(timezone) });
}

export function useQuota(): UseQueryResult<Quota> {
  const api = useApi();
  return useQuery({ queryKey: keys.quota, queryFn: () => api.getQuota() });
}

export function useWorkspaces(): UseQueryResult<Page<Workspace>> {
  const api = useApi();
  return useQuery({ queryKey: keys.workspaces, queryFn: () => api.listWorkspaces() });
}

export function useWorkspace(workspaceId: string): UseQueryResult<Workspace> {
  const api = useApi();
  return useQuery({
    queryKey: keys.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
  });
}

export function useCreateWorkspace(): UseMutationResult<
  Workspace,
  Error,
  CreateWorkspaceInput
> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => api.createWorkspace(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useDeleteWorkspace(): UseMutationResult<void, Error, string> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.deleteWorkspace(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useSources(workspaceId: string): UseQueryResult<Page<Source>> {
  const api = useApi();
  return useQuery({
    queryKey: keys.sources(workspaceId),
    queryFn: () => api.listSources(workspaceId),
  });
}

export function useSource(
  workspaceId: string,
  sourceId: string,
): UseQueryResult<Source> {
  const api = useApi();
  return useQuery({
    queryKey: keys.source(workspaceId, sourceId),
    queryFn: () => api.getSource(workspaceId, sourceId),
  });
}

export function useSourceChunks(
  workspaceId: string,
  sourceId: string,
): UseQueryResult<Page<SourceChunk>> {
  const api = useApi();
  return useQuery({
    queryKey: keys.chunks(workspaceId, sourceId),
    queryFn: () => api.getSourceChunks(workspaceId, sourceId),
  });
}

export function useAddSource(
  workspaceId: string,
): UseMutationResult<Job, Error, AddSourceInput> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddSourceInput) => api.addSource(workspaceId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  });
}

export function useDeleteSource(
  workspaceId: string,
): UseMutationResult<void, Error, string> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.deleteSource(workspaceId, sourceId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  });
}

export function useConcepts(workspaceId: string): UseQueryResult<Concept[]> {
  const api = useApi();
  return useQuery({
    queryKey: keys.concepts(workspaceId),
    queryFn: () => api.listConcepts(workspaceId),
  });
}

export function useConcept(
  workspaceId: string,
  conceptId: string,
): UseQueryResult<Concept> {
  const api = useApi();
  return useQuery({
    queryKey: keys.concept(workspaceId, conceptId),
    queryFn: () => api.getConcept(workspaceId, conceptId),
  });
}

export function useReadiness(
  workspaceId: string,
  conceptId: string,
): UseQueryResult<Readiness> {
  const api = useApi();
  return useQuery({
    queryKey: keys.readiness(workspaceId, conceptId),
    queryFn: () => api.getConceptReadiness(workspaceId, conceptId),
  });
}

export function useExtractConcepts(
  workspaceId: string,
): UseMutationResult<Job, Error, void> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.extractConcepts(workspaceId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  });
}

/**
 * Poll a job until it settles.
 *
 * `refetchInterval` returns `false` once the job is done, so the polling stops
 * rather than continuing forever against a finished row. On the free plan the
 * poll is also what *advances* the job (see `jobs/runner.ts`), which makes the
 * interval a throughput knob as well as a freshness one — 1200ms is slow enough
 * not to hammer the Worker and fast enough that ingestion feels like progress.
 */
export function useJob(workspaceId: string, jobId: string | null): UseQueryResult<Job> {
  const api = useApi();
  return useQuery({
    queryKey: keys.job(workspaceId, jobId ?? 'none'),
    queryFn: () => api.getJob(workspaceId, jobId!),
    enabled: jobId !== null,
    refetchInterval: (queryResult) => {
      const status = queryResult.state.data?.status;
      return status === 'succeeded' || status === 'failed' ? false : 1200;
    },
  });
}

export function useSession(
  workspaceId: string,
  sessionId: string,
): UseQueryResult<Session> {
  const api = useApi();
  return useQuery({
    queryKey: keys.session(workspaceId, sessionId),
    queryFn: () => api.getSession(workspaceId, sessionId),
  });
}

/** Every session command writes the returned session straight into the cache. */
function useSessionCommand<TInput>(
  workspaceId: string,
  run: (api: ApiClient, input: TInput) => Promise<Session>,
): UseMutationResult<Session, Error, TInput> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => run(api, input),
    onSuccess: (session) => {
      // Written rather than invalidated: the response IS the new state, and a
      // refetch would show the old one for a frame. The wider invalidation
      // below covers everything the command may have changed elsewhere.
      queryClient.setQueryData(keys.session(workspaceId, session.id), session);
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });
}

export function useStartSession(workspaceId: string) {
  return useSessionCommand<string>(workspaceId, (api, conceptId) =>
    api.startSession(workspaceId, conceptId),
  );
}

export function useStartReview(workspaceId: string) {
  return useSessionCommand<string>(workspaceId, (api, conceptId) =>
    api.startReview(workspaceId, conceptId),
  );
}

export function useAdvanceStage(workspaceId: string, sessionId: string) {
  return useSessionCommand<AdvanceStageInput>(workspaceId, (api, input) =>
    api.advanceStage(workspaceId, sessionId, input),
  );
}

export function useRequestHint(workspaceId: string, sessionId: string) {
  return useSessionCommand<SessionCommandInput>(workspaceId, (api, input) =>
    api.requestHint(workspaceId, sessionId, input),
  );
}

export function useRevealAnswer(workspaceId: string, sessionId: string) {
  return useSessionCommand<SessionCommandInput>(workspaceId, (api, input) =>
    api.revealAnswer(workspaceId, sessionId, input),
  );
}

export function useSubmitResponse(workspaceId: string, sessionId: string) {
  return useSessionCommand<SubmitResponseInput>(workspaceId, (api, input) =>
    api.submitResponse(workspaceId, sessionId, input),
  );
}

export function useEndSession(workspaceId: string, sessionId: string) {
  return useSessionCommand<void>(workspaceId, (api) =>
    api.endSession(workspaceId, sessionId),
  );
}

export function useAsk(
  workspaceId: string,
): UseMutationResult<AskResponse, Error, AskInput> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AskInput) => api.ask(workspaceId, input),
    onSuccess: (response) => {
      // Asking during a check changed a session's assistance server-side. The
      // open session must refetch or the UI would keep claiming "no help used"
      // about an item that now carries some.
      if (response.recordedAsSupport) {
        void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      }
    },
  });
}

export function useConceptEvidence(
  workspaceId: string,
  conceptId: string,
): UseQueryResult<ConceptEvidence> {
  const api = useApi();
  return useQuery({
    queryKey: keys.evidence(workspaceId, conceptId),
    queryFn: () => api.getConceptEvidence(workspaceId, conceptId),
  });
}

export function useEvidenceSummary(workspaceId: string): UseQueryResult<EvidenceSummary> {
  const api = useApi();
  return useQuery({
    queryKey: keys.summary(workspaceId),
    queryFn: () => api.getEvidenceSummary(workspaceId),
  });
}

export function useStudyPlan(workspaceId: string): UseQueryResult<StudyPlan> {
  const api = useApi();
  return useQuery({
    queryKey: keys.plan(workspaceId),
    queryFn: () => api.getStudyPlan(workspaceId),
  });
}

export function useDueReviews(workspaceId: string): UseQueryResult<Concept[]> {
  const api = useApi();
  return useQuery({
    queryKey: keys.reviews(workspaceId),
    queryFn: () => api.listDueReviews(workspaceId),
  });
}
