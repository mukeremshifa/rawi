import type { LearnerSourceSummary } from '../shared/types.js';

interface StoredSource extends LearnerSourceSummary {
  readonly userId: string;
  readonly extractedText: string;
}

export interface StoredIssue {
  readonly id: string;
  readonly userId: string;
  readonly sessionId?: string;
  readonly category: 'content' | 'technical' | 'privacy' | 'other';
  readonly description: string;
  readonly status: 'open' | 'resolved';
  readonly createdAt: string;
}

const sources = new Map<string, StoredSource>();
const issues = new Map<string, StoredIssue>();

export function addFixtureSource(source: StoredSource): { source: StoredSource; duplicate: boolean } {
  const existing = [...sources.values()].find(
    (item) => item.userId === source.userId && item.sha256 === source.sha256,
  );
  if (existing) return { source: existing, duplicate: true };
  sources.set(source.id, source);
  return { source, duplicate: false };
}

export function listFixtureSources(userId: string): LearnerSourceSummary[] {
  return [...sources.values()]
    .filter((source) => source.userId === userId)
    .map(toSummary);
}

export function getFixtureSource(
  userId: string,
  sourceId: string,
): { summary: LearnerSourceSummary; text: string } | undefined {
  const source = sources.get(sourceId);
  if (!source || source.userId !== userId) return undefined;
  return { summary: toSummary(source), text: source.extractedText };
}

function toSummary(source: StoredSource): LearnerSourceSummary {
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    status: source.status,
    chars: source.chars,
    sha256: source.sha256,
    createdAt: source.createdAt,
  };
}

export function deleteFixtureSource(userId: string, sourceId: string): boolean {
  const existing = sources.get(sourceId);
  if (!existing || existing.userId !== userId) return false;
  return sources.delete(sourceId);
}

export function addFixtureIssue(issue: StoredIssue): void {
  issues.set(issue.id, issue);
}

export function listFixtureIssues(userId: string): StoredIssue[] {
  return [...issues.values()].filter((issue) => issue.userId === userId);
}

export function deleteFixtureOperations(userId: string): void {
  for (const [id, source] of sources) {
    if (source.userId === userId) sources.delete(id);
  }
  for (const [id, issue] of issues) {
    if (issue.userId === userId) issues.delete(id);
  }
}

export function clearFixtureOperations(): void {
  sources.clear();
  issues.clear();
}
