// The style guide at every width (docs/STYLE-MIGRATION.md): globals.css's
// guide block matches src/styles/tokens/styleGuide.ts, and uses only the
// guide's own colours (no status colours, no dark theme).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { styleGuide } from '../app/src/styles/tokens/styleGuide';

const css = readFileSync(join(__dirname, '../app/src/styles/base/globals.css'), 'utf8');
const start = css.indexOf(":root,\n[data-theme='light'],\n[data-theme='dark'] {");
const phone = css.slice(start, css.indexOf('\n}\n', start));

const guideColours = new Set(
  [...Object.values(styleGuide.brand), ...Object.values(styleGuide.neutrals), styleGuide.destructive].map((c) => c.toLowerCase())
);

test('the guide block exists, applies at every width and covers both themes', () => {
  assert.ok(start > 0);
  assert.match(phone, /\[data-theme='dark'\]/);
  assert.match(phone, /color-scheme: light/);
  // No width limit, and nothing left of the old light and dark blocks.
  assert.doesNotMatch(css, /@media \(max-width: 767\.98px\)/);
  assert.equal(css.match(/\[data-theme='dark'\]/g)?.length, 1);
});

test('the guide block holds the same values as styleGuide.ts', () => {
  const value = (name: string) => new RegExp(`--${name}: ([^;]+);`).exec(phone)?.[1].trim().toLowerCase();
  assert.equal(value('sg-primary'), styleGuide.brand.primary.toLowerCase());
  assert.equal(value('sg-primary-dark'), styleGuide.brand.primaryDark.toLowerCase());
  assert.equal(value('sg-accent'), styleGuide.brand.accent.toLowerCase());
  assert.equal(value('sg-primary-light'), styleGuide.brand.primaryLight.toLowerCase());
  assert.equal(value('sg-destructive'), styleGuide.destructive.toLowerCase());
  for (const [step, hex] of Object.entries(styleGuide.neutrals)) assert.equal(value(`sg-neutral-${step}`), hex.toLowerCase(), `neutral-${step}`);
  assert.equal(value('radius-sm'), `${styleGuide.radius.sm}px`);
  assert.equal(value('radius-md'), `${styleGuide.radius.md}px`);
  assert.equal(value('radius-lg'), `${styleGuide.radius.lg}px`);
});

test('only guide colours in the guide block: no status colours', () => {
  const hexes = phone.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  for (const hex of hexes) assert.ok(guideColours.has(hex.toLowerCase()), `${hex} is not in the style guide`);
  assert.doesNotMatch(phone, /rgba?\(/);
  // Success and danger point at guide colours, never a new green or orange.
  assert.match(phone, /--color-success: var\(--sg-primary\);/);
  assert.match(phone, /--color-danger: var\(--sg-destructive\);/);
});

test('the guide fonts are loaded', () => {
  const layout = readFileSync(join(__dirname, '../app/app/layout.tsx'), 'utf8');
  for (const font of ['Bricolage_Grotesque', 'Figtree', 'IBM_Plex_Mono']) assert.match(layout, new RegExp(font));
  assert.match(phone, /--font-family-heading: var\(--font-bricolage\)/);
  assert.match(phone, /--font-family-body: var\(--font-figtree\)/);
});

test('every width shows the style guide logo', () => {
  const logo = readFileSync(join(__dirname, '../app/src/widgets/Logo/Logo.tsx'), 'utf8');
  const logoCss = readFileSync(join(__dirname, '../app/src/widgets/Logo/Logo.module.css'), 'utf8');
  assert.match(logo, /\/brand\/dreda-full\.png/);
  assert.match(logo, /\/brand\/dreda-full-reversed\.png/);
  assert.doesNotMatch(logo, /logo_primary|logo_alt/);
  assert.doesNotMatch(logoCss, /@media/);
  for (const f of ['dreda-full', 'dreda-full-reversed', 'dreda-mark', 'dreda-mark-reversed']) {
    assert.ok(readFileSync(join(__dirname, `../app/public/brand/${f}.png`)).length > 1000, f);
  }
});

// Phases 3 and 4: every phone stylesheet uses only guide colours (white is
// neutral-0; black only in masks). Comments are skipped; shadows and
// overlays may still use a black or navy alpha. The `.web.module.css` files
// and phone Home (whose classes the web dashboard reuses; its phone look is
// in a phone-only block) are left out.
function phoneStylesheets(dir = join(__dirname, '../app/src/phone')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return phoneStylesheets(path);
    return entry.name.endsWith('.css') && !entry.name.endsWith('.web.module.css') ? [path] : [];
  });
}

test('every phone stylesheet uses only the guide colours, and none has dark rules', () => {
  const allowed = new Set([...guideColours, '#fff', '#ffffff']);
  const files = phoneStylesheets();
  assert.ok(files.length > 40);
  for (const path of files) {
    const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /data-theme=['"]dark['"]/, path);
    if (path.includes('/Home/')) continue;
    for (const line of code.split('\n')) {
      if (/mask-image|^\s*#000/.test(line)) continue;
      for (const hex of line.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []) assert.ok(allowed.has(hex.toLowerCase()), `${path}: ${hex} is not in the style guide`);
    }
  }
});

// Phase 7: the web and tablet stylesheets too (everything outside
// src/phone). The receipt stays a printed black-and-grey slip.
function webStylesheets(dir = join(__dirname, '../app/src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'phone' ? [] : webStylesheets(path);
    return entry.name.endsWith('.css') && !path.endsWith('globals.css') && !path.includes('/Receipt/') ? [path] : [];
  });
}

test('every web stylesheet uses only the guide colours, and none has dark rules', () => {
  const files = [...webStylesheets(), ...webStylesheets(join(__dirname, '../app/app'))];
  assert.ok(files.length > 100);
  for (const path of files) {
    const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /data-theme=['"]dark['"]|prefers-color-scheme:\s*dark/, path);
    for (const hex of code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) assert.ok(['#fff', '#ffffff'].includes(hex.toLowerCase()), `${path}: ${hex} is not a guide token`);
    for (const rgb of code.match(/rgba?\([^)]*\)/g) ?? []) assert.match(rgb, /^rgba?\(\s*255,\s*255,\s*255/, `${path}: ${rgb} is not a guide token`);
  }
});
