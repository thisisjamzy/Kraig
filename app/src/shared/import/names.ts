// How an import matches names to what exists: the same after trimming
// spaces, collapsing double spaces and ignoring capital letters ("Learning
// French" matches "learning  french"). Nothing fuzzy: a similar but
// different name is a different thing. Pure; tested in
// test/importTemplates.test.ts.

export function nameKey(name: unknown): string {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sameName(a: unknown, b: unknown): boolean {
  const x = nameKey(a);
  return x.length > 0 && x === nameKey(b);
}
