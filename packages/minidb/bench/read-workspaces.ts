// bench/read-workspaces.ts
//
// Workspace catalog reader for the bench scripts. Current homes keep the
// catalog in `projects.json` (`projects` map, schema_version 2); pre-migration
// homes still carry the legacy `workspaces.json` (`workspaces` map).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface BenchWorkspaceEntry {
  name: string;
  root: string;
  created_at?: string;
  last_opened_at?: string;
}

export function readWorkspaceEntries(homeDir: string): Record<string, BenchWorkspaceEntry> {
  const projectsPath = path.join(homeDir, 'projects.json');
  const legacyPath = path.join(homeDir, 'workspaces.json');
  const file = existsSync(projectsPath) ? projectsPath : legacyPath;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    projects?: Record<string, BenchWorkspaceEntry>;
    workspaces?: Record<string, BenchWorkspaceEntry>;
  };
  return raw.projects ?? raw.workspaces ?? {};
}
