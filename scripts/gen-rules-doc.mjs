#!/usr/bin/env node
// Generates the RULES_DOC constant inside base44/functions/askRules/entry.ts from
// docs/whist-rules.md — the single source of truth for the rules assistant.
//
// Why generate instead of import: Base44 functions are one self-contained entry.ts
// each (no multi-file function in this repo) and Deno can't read repo files at
// runtime, so the rulebook has to be inlined. This script keeps that inline copy
// honest instead of asking a human to mirror 200 lines by hand.
//
//   npm run rules:gen     rewrite the generated block from the doc
//   npm run rules:check   fail (exit 1) if the block is stale — for CI/pre-push
//
// §0 of the doc ("how this is wired") is stripped: it's instructions for us, not
// knowledge for the assistant.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(repoRoot, 'docs/whist-rules.md');
const FN = join(repoRoot, 'base44/functions/askRules/entry.ts');

const BEGIN = '// <<< BEGIN GENERATED RULES_DOC — do not edit by hand; run `npm run rules:gen` >>>';
const END = '// <<< END GENERATED RULES_DOC >>>';

const die = (msg) => {
  console.error(`gen-rules-doc: ${msg}`);
  process.exit(1);
};

// ── Doc → assistant context ──────────────────────────────────────────────────
const lines = readFileSync(DOC, 'utf8').split('\n');
const metaStart = lines.findIndex((l) => /^## 0\./.test(l));
const rulesStart = lines.findIndex((l) => /^## 1\./.test(l));

if (metaStart === -1) die(`no "## 0." section found in ${DOC} — did the doc get renumbered?`);
if (rulesStart === -1) die(`no "## 1." section found in ${DOC} — did the doc get renumbered?`);
if (rulesStart < metaStart) die('"## 1." appears before "## 0." — unexpected doc order');

const context = [...lines.slice(0, metaStart), ...lines.slice(rulesStart)]
  .join('\n')
  .trimEnd();

// Template-literal safety: the doc is markdown and may grow code fences.
const escaped = context
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const block = [
  BEGIN,
  `// Source: docs/whist-rules.md (§0 stripped — it documents the pipeline, not the game).`,
  `const RULES_DOC = \`${escaped}\`;`,
  END,
].join('\n');

// ── Splice into entry.ts ─────────────────────────────────────────────────────
const current = readFileSync(FN, 'utf8');
const beginAt = current.indexOf(BEGIN);
const endAt = current.indexOf(END);

if (beginAt === -1 || endAt === -1) {
  die(`markers not found in ${FN}. Re-add:\n${BEGIN}\n<generated>\n${END}`);
}
if (endAt < beginAt) die(`END marker precedes BEGIN marker in ${FN}`);

const next = current.slice(0, beginAt) + block + current.slice(endAt + END.length);

if (process.argv.includes('--check')) {
  if (next !== current) {
    die(
      'base44/functions/askRules/entry.ts is out of sync with docs/whist-rules.md.\n' +
        '  Fix: npm run rules:gen  (then `base44 deploy` — sync does not deploy functions)'
    );
  }
  console.log('gen-rules-doc: askRules RULES_DOC matches docs/whist-rules.md ✓');
  process.exit(0);
}

if (next === current) {
  console.log('gen-rules-doc: already up to date ✓');
} else {
  writeFileSync(FN, next);
  console.log(
    `gen-rules-doc: wrote ${context.split('\n').length} doc lines into askRules/entry.ts\n` +
      '  ⚠️  functions change → run `npx base44@latest deploy` (GitHub sync does not deploy functions)'
  );
}
