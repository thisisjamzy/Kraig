// The style guide on the phone (docs/STYLE-MIGRATION.md): globals.css's
// phone block matches src/styles/tokens/styleGuide.ts, and uses only the
// guide's own colours (no status colours).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { styleGuide } from '../app/src/styles/tokens/styleGuide';

const css = readFileSync(join(__dirname, '../app/src/styles/base/globals.css'), 'utf8');
const start = css.indexOf('@media (max-width: 767.98px)');
const phone = css.slice(start, css.indexOf('\n}\n', start));

const guideColours = new Set(
  [...Object.values(styleGuide.brand), ...Object.values(styleGuide.neutrals), styleGuide.destructive].map((c) => c.toLowerCase())
);

test('the phone block exists and covers both themes', () => {
  assert.ok(start > 0);
  assert.match(phone, /\[data-theme='dark'\]/);
  assert.match(phone, /color-scheme: light/);
});

test('the phone block holds the same values as styleGuide.ts', () => {
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

test('only guide colours on the phone: no status colours', () => {
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

test('the phone shows the style guide logo, the web keeps the old one', () => {
  const logo = readFileSync(join(__dirname, '../app/src/widgets/Logo/Logo.tsx'), 'utf8');
  const logoCss = readFileSync(join(__dirname, '../app/src/widgets/Logo/Logo.module.css'), 'utf8');
  assert.match(logo, /\/brand\/dreda-full\.png/);
  assert.match(logo, /\/brand\/dreda-full-reversed\.png/);
  assert.match(logoCss, /@media \(max-width: 767\.98px\)[\s\S]*\.phone\.phone \{\s*display: block;[\s\S]*\.web\.web \{\s*display: none;/);
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
