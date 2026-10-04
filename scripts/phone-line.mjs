#!/usr/bin/env node
// Phone line freeze (docs/UI-LINES.md).
//
// Finds every UI file a phone can render: each page and layout under
// app/app, followed through static imports. Dynamic import() is not
// followed, which is how the web line is loaded (src/routes), so web-only
// files never count. "UI file" means .tsx, .css and src/strings; plain .ts
// logic is shared by both lines and is not frozen.
//
//   node scripts/phone-line.mjs           check: fails if any of those files
//                                          changed since app/phone-line.lock.json
//   node scripts/phone-line.mjs --approve  record the current phone UI as
//                                          approved (only when the phone change
//                                          was asked for)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const LOCK = path.join(APP, 'phone-line.lock.json');

function resolve(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(APP, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// Static imports and re-exports only; `import type` renders nothing.
const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function staticImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(IMPORT)) {
    if (m[2]) continue;
    const r = resolve(file, m[3]);
    if (r) out.push(r);
  }
  return out;
}

function entries() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^(page|layout)\.tsx$/.test(e.name)) out.push(p);
    }
  })(path.join(APP, 'app'));
  return out;
}

function phoneFiles() {
  const seen = new Set();
  const stack = entries();
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (/\.tsx?$/.test(f)) stack.push(...staticImports(f));
  }
  const rel = (f) => path.relative(APP, f).split(path.sep).join('/');
  return [...seen].map(rel).filter((r) => /\.(tsx|css)$/.test(r) || r.startsWith('src/strings/')).sort();
}

function snapshot() {
  const files = {};
  for (const r of phoneFiles()) files[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(APP, r))).digest('hex').slice(0, 16);
  return files;
}

const now = snapshot();
if (process.argv.includes('--approve')) {
  fs.writeFileSync(LOCK, `${JSON.stringify({ note: 'Approved phone UI (docs/UI-LINES.md). Update only with npm run phone:approve, for a phone change that was asked for.', files: now }, null, 2)}\n`);
  console.log(`Phone line approved: ${Object.keys(now).length} files.`);
  process.exit(0);
}

const locked = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')).files : {};
const changed = [];
for (const [r, h] of Object.entries(now)) if (locked[r] === undefined) changed.push(`added    ${r}`);
else if (locked[r] !== h) changed.push(`changed  ${r}`);
for (const r of Object.keys(locked)) if (now[r] === undefined) changed.push(`removed  ${r}`);

if (changed.length) {
  console.error('The phone UI changed. Phones render these files:\n');
  for (const c of changed) console.error(`  ${c}`);
  console.error('\nIf the phone change was asked for: npm run phone:approve');
  console.error('Otherwise move the change into the web line (docs/UI-LINES.md).');
  process.exit(1);
}
console.log(`Phone line unchanged (${Object.keys(now).length} files).`);
