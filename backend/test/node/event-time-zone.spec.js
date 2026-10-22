import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Event_Time_Zone guard (Requirements 17.6, 23.13, 23.14). The zone name,
// offset and label live only in shared/time.mjs, and public reads use Worker_Time
// (Date.now()) in JS, never database time. This test scans the real source tree
// and fails with every offending file and line, so a violation is actionable.

// Repo root: this file is backend/test/node/, so the repo root is three up.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// Source trees to scan. Tests are not here, so test fixtures using the zone text are fine.
const SCAN_DIRS = ['backend/src', 'backend/scripts', 'frontend/src', 'shared'];

// Directories never worth scanning.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'output', '.wrangler', 'coverage']);

const SOURCE_EXT = /\.(js|jsx|mjs)$/;
// `sample*.js` files hold fake display data, like the seed, and are excluded.
const SAMPLE_FILE = /(^|[\\/])sample[^\\/]*\.js$/i;

// A repo-relative POSIX path for messages and exclusion checks.
const rel = (abs) => relative(repoRoot, abs).replace(/\\/g, '/');

function isExcluded(relPath) {
  if (relPath === 'shared/time.mjs') return true;
  if (relPath === 'frontend/src/features/preview/previewData.js') return true;
  if (SAMPLE_FILE.test(relPath)) return true;
  return false;
}

function collect(absDir) {
  const out = [];
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...collect(abs));
    } else if (SOURCE_EXT.test(entry) && !isExcluded(rel(abs))) {
      out.push(abs);
    }
  }
  return out;
}

const scanned = SCAN_DIRS.flatMap((d) => collect(join(repoRoot, d)));

// Zone-fact patterns. The alpha label "IST" is matched case-sensitively as a whole
// word so the zone label literal is caught while lowercase identifiers such as a local
// `ist` variable are not. The offset and whole-number tokens are the zone's magic values.
const ZONE_PATTERNS = [
  { name: 'zone name "Asia/Kolkata"', re: /Asia\/Kolkata/ },
  { name: 'UTC offset literal (+05:30)', re: /[+-]0?5:30/ },
  { name: 'offset magic number (330 or 19800)', re: /\b(?:330|19800)\b/ },
  { name: 'zone label "IST"', re: /\bIST\b/ },
];

// SQL time functions forbidden in public.js: public phase uses Worker_Time, not database time.
const PUBLIC_TIME_RE = /\b(?:now\s*\(\s*\)|current_date|current_timestamp|localtimestamp)\b/i;

function violationsFor(relPath, text, patterns) {
  const found = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of patterns) {
      if (p.re.test(line)) found.push(`${relPath}:${i + 1} contains ${p.name} -> ${line.trim()}`);
    }
  });
  return found;
}

describe('Event_Time_Zone guard', () => {
  it('scans at least the known source trees', () => {
    // Sanity: the scan actually found files, so an empty glob never passes silently.
    expect(scanned.length).toBeGreaterThan(0);
  });

  it('no source file outside shared/time.mjs holds the zone name, offset or label (Req 23.13, 23.14)', () => {
    const violations = scanned.flatMap((abs) =>
      violationsFor(rel(abs), readFileSync(abs, 'utf8'), ZONE_PATTERNS),
    );
    expect(violations, `Zone facts must live only in shared/time.mjs:\n${violations.join('\n')}`).toEqual([]);
  });

  it('backend/src/routes/public.js uses no SQL time function (Req 17.6)', () => {
    const relPath = 'backend/src/routes/public.js';
    const abs = join(repoRoot, relPath);
    const violations = violationsFor(relPath, readFileSync(abs, 'utf8'), [
      { name: 'SQL time function', re: PUBLIC_TIME_RE },
    ]);
    expect(violations, `Public reads must use Worker_Time (Date.now()) in JS, not database time:\n${violations.join('\n')}`).toEqual([]);
  });
});
