import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import {
  APPLY_EXCLUDED_PATTERNS,
  CHECK_EXCLUDED_PATTERNS,
  COMMAND_ALLOWLIST,
  COPY_EXTENSIONS,
  DEFAULT_COPY_SURFACES,
  DEFAULT_IDENTITY_ROOTS,
  HISTORY_PATH_PATTERNS,
  IDENTITY_EXTENSIONS,
  KNOWN_RESIDUALS,
  LEGACY_COMMAND_PATTERNS,
  MANIFEST_PATH_PATTERNS,
  OVER_RENAME_RULES,
  PLATFORM_CONTEXT_ALLOWLIST,
  PRODUCT_PHRASES,
  SCRIPT_EXTENSIONS,
  TEST_PATH_PATTERNS,
} from './mapping.mjs';

function matchesAny(patterns, value) {
  return patterns.some((pattern) => pattern.test(value));
}

export function isHistoryPath(relPath) {
  return matchesAny(HISTORY_PATH_PATTERNS, relPath);
}

function isManifestPath(relPath) {
  return matchesAny(MANIFEST_PATH_PATTERNS, relPath);
}

function isTestPath(relPath) {
  return matchesAny(TEST_PATH_PATTERNS, relPath);
}

function maskUntil(chars, source, start, terminator) {
  let cursor = start;
  while (cursor < source.length && source[cursor] !== terminator) {
    chars[cursor] = ' ';
    cursor++;
  }
  return cursor;
}

function skipString(source, start) {
  const quote = source[start];
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor++;
  }
  return cursor;
}

export function maskComments(source, extension) {
  if (!SCRIPT_EXTENSIONS.has(extension)) return source;
  const chars = source.split('');
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index = maskUntil(chars, source, index, '\n');
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let cursor = index; cursor < stop; cursor++) {
        if (source[cursor] !== '\n') chars[cursor] = ' ';
      }
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(source, index);
      continue;
    }
    index++;
  }
  return chars.join('');
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function positionAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= index) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: index - starts[lineIndex] + 1 };
}

function lineBounds(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return { start, end: end === -1 ? text.length : end };
}

function isAllowedAt(text, start, end, allowlist) {
  const { start: lineStart, end: lineEnd } = lineBounds(text, start);
  const line = text.slice(lineStart, lineEnd);
  for (const entry of allowlist) {
    for (const match of line.matchAll(entry.pattern)) {
      const matchStart = lineStart + (match.index ?? 0);
      const matchEnd = matchStart + match[0].length;
      if (matchStart < end && start < matchEnd) return true;
    }
  }
  return false;
}

function collectFiles({ root, paths, extensions, excluded }) {
  const files = [];
  const seen = new Set();

  function addFile(absolute) {
    if (seen.has(absolute)) return;
    const extension = extname(absolute).toLowerCase();
    if (!extensions.has(extension)) return;
    const relPath = relative(root, absolute).split(sep).join('/');
    if (matchesAny(excluded, relPath)) return;
    seen.add(absolute);
    files.push({ absolute, rel: relPath, extension });
  }

  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relPath = relative(root, absolute).split(sep).join('/');
      if (matchesAny(excluded, `${relPath}/`)) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) addFile(absolute);
    }
  }

  for (const pathEntry of paths) {
    const absolute = resolve(root, pathEntry);
    if (!existsSync(absolute)) throw new Error(`Path not found: ${pathEntry}`);
    const stats = statSync(absolute);
    const relPath = relative(root, absolute).split(sep).join('/');
    if (stats.isDirectory()) {
      if (matchesAny(excluded, `${relPath}/`)) continue;
      visit(absolute);
    } else if (stats.isFile()) {
      addFile(absolute);
    }
  }
  return files;
}

function isKnownResidual(relPath, masked, start, end) {
  for (const residual of KNOWN_RESIDUALS) {
    if (!residual.path.test(relPath)) continue;
    for (const match of masked.matchAll(residual.pattern)) {
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + match[0].length;
      if (matchStart < end && start < matchEnd) return residual;
    }
  }
  return undefined;
}

function collectCopyViolations(relPath, masked, starts) {
  const violations = [];
  const suppressed = [];
  if (isHistoryPath(relPath)) return { violations, suppressed };

  const candidates = [];
  for (const phrase of PRODUCT_PHRASES) {
    for (const match of masked.matchAll(phrase.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isAllowedAt(masked, start, end, PLATFORM_CONTEXT_ALLOWLIST)) continue;
      candidates.push({
        kind: 'product-brand',
        start,
        end,
        text: match[0],
        rule: phrase.id,
        message: phrase.reason,
      });
    }
  }
  for (const rule of LEGACY_COMMAND_PATTERNS) {
    for (const match of masked.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isAllowedAt(masked, start, end, COMMAND_ALLOWLIST)) continue;
      candidates.push({
        kind: 'legacy-command',
        start,
        end,
        text: match[0],
        rule: rule.id,
        message: rule.reason,
      });
    }
  }

  for (const candidate of sortNonOverlapping(candidates)) {
    const residual = isKnownResidual(relPath, masked, candidate.start, candidate.end);
    if (residual !== undefined) {
      suppressed.push({
        file: relPath,
        ...positionAt(starts, candidate.start),
        text: candidate.text,
        rule: residual.id,
        finding: residual.finding,
        reason: residual.reason,
      });
      continue;
    }
    violations.push({
      kind: candidate.kind,
      file: relPath,
      ...positionAt(starts, candidate.start),
      text: candidate.text,
      rule: candidate.rule,
      message: candidate.message,
    });
  }
  return { violations, suppressed };
}

function collectIdentityViolations(relPath, masked, starts, violations, seen) {
  for (const rule of OVER_RENAME_RULES) {
    for (const match of masked.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const key = `${relPath}:${start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        kind: 'platform-identity',
        file: relPath,
        ...positionAt(starts, start),
        text: match[0],
        rule: rule.id,
        message: rule.reason,
      });
    }
  }
}

function compareViolations(a, b) {
  const byFile = a.file.localeCompare(b.file);
  if (byFile !== 0) return byFile;
  const byLine = a.line - b.line;
  if (byLine !== 0) return byLine;
  const byColumn = a.column - b.column;
  if (byColumn !== 0) return byColumn;
  return a.rule.localeCompare(b.rule);
}

export function checkPaths({ root, paths }) {
  const copyPaths = paths.length > 0 ? paths : DEFAULT_COPY_SURFACES;
  const identityPaths = paths.length > 0 ? paths : DEFAULT_IDENTITY_ROOTS;
  const copyFiles = collectFiles({
    root,
    paths: copyPaths,
    extensions: COPY_EXTENSIONS,
    excluded: CHECK_EXCLUDED_PATTERNS,
  });
  const identityFiles = collectFiles({
    root,
    paths: identityPaths,
    extensions: IDENTITY_EXTENSIONS,
    excluded: CHECK_EXCLUDED_PATTERNS,
  });
  const sources = new Map();
  const read = (file) => {
    const cached = sources.get(file.absolute);
    if (cached !== undefined) return cached;
    const source = readFileSync(file.absolute, 'utf8');
    sources.set(file.absolute, source);
    return source;
  };

  const violations = [];
  const suppressed = [];
  for (const file of copyFiles) {
    const masked = maskComments(read(file), file.extension);
    const copy = collectCopyViolations(file.rel, masked, lineStarts(masked));
    violations.push(...copy.violations);
    suppressed.push(...copy.suppressed);
  }
  const identitySeen = new Set();
  for (const file of identityFiles) {
    const masked = maskComments(read(file), file.extension);
    collectIdentityViolations(file.rel, masked, lineStarts(masked), violations, identitySeen);
  }

  violations.sort(compareViolations);
  suppressed.sort(compareViolations);
  const scanned = new Set([...copyFiles, ...identityFiles].map((file) => file.absolute)).size;
  return { ok: violations.length === 0, root, scannedFiles: scanned, violations, suppressed };
}

function sortNonOverlapping(items) {
  const sorted = items.toSorted((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const item of sorted) {
    const previous = kept.at(-1);
    if (previous !== undefined && item.start < previous.end) continue;
    kept.push(item);
  }
  return kept;
}

function collectEdits(masked) {
  const edits = [];
  for (const phrase of PRODUCT_PHRASES) {
    for (const match of masked.matchAll(phrase.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isAllowedAt(masked, start, end, PLATFORM_CONTEXT_ALLOWLIST)) continue;
      edits.push({ start, end, text: phrase.replacement });
    }
  }
  for (const rule of LEGACY_COMMAND_PATTERNS) {
    for (const match of masked.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isAllowedAt(masked, start, end, COMMAND_ALLOWLIST)) continue;
      edits.push({ start, end, text: rule.apply(match) });
    }
  }
  return sortNonOverlapping(edits);
}

function applyEdits(source, edits) {
  let result = source;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }
  return result;
}

export function applyPaths({
  root,
  paths,
  dryRun = false,
  includeHistory = false,
  includeManifests = false,
  includeTests = false,
}) {
  const files = collectFiles({
    root,
    paths,
    extensions: IDENTITY_EXTENSIONS,
    excluded: APPLY_EXCLUDED_PATTERNS,
  });
  const changed = [];
  const skipped = [];
  let totalReplacements = 0;

  for (const file of files) {
    if (!includeHistory && isHistoryPath(file.rel)) {
      skipped.push({ file: file.rel, reason: 'history' });
      continue;
    }
    if (!includeManifests && isManifestPath(file.rel)) {
      skipped.push({ file: file.rel, reason: 'manifest' });
      continue;
    }
    if (!includeTests && isTestPath(file.rel)) {
      skipped.push({ file: file.rel, reason: 'test' });
      continue;
    }
    const source = readFileSync(file.absolute, 'utf8');
    const masked = maskComments(source, file.extension);
    const edits = collectEdits(masked);
    if (edits.length === 0) continue;
    const next = applyEdits(source, edits);
    if (next === source) continue;
    if (!dryRun) writeFileSync(file.absolute, next);
    totalReplacements += edits.length;
    changed.push({ file: file.rel, replacements: edits.length });
  }

  return { root, dryRun, changed, skipped, totalReplacements };
}