import type { SessionSummary } from '@moonshot-ai/agent-core-v2';
import type { SessionsSort } from '../protocol/rest-session';

export interface SessionPosition { key: number; id: string }

export function sessionKey(sort: SessionsSort, summary: Pick<SessionSummary, 'createdAt' | 'updatedAt'>): number {
  return sort === 'created_at_desc' ? summary.createdAt : summary.updatedAt;
}

export function compareSessionGroups(sort: SessionsSort, a: SessionPosition, b: SessionPosition): number {
  return a.key === b.key ? a.id.localeCompare(b.id) : sort === 'updated_at_asc' ? a.key - b.key : b.key - a.key;
}

export function compareSessionPositions(sort: SessionsSort, a: SessionPosition, b: SessionPosition): number {
  if (a.key !== b.key) return sort === 'updated_at_asc' ? a.key - b.key : b.key - a.key;
  const order = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return sort === 'updated_at_asc' ? order : -order;
}

export function sessionPositionOf(groups: boolean, sort: SessionsSort, entry: Record<string, unknown>): SessionPosition {
  const session = groups ? (entry['sessions'] as Record<string, unknown>[])[0]! : entry;
  const id = groups ? entry['workspace_id'] as string : entry['id'] as string;
  const timestamp = session[sort === 'created_at_desc' ? 'created_at' : 'updated_at'] as string;
  return { key: Date.parse(timestamp), id };
}
