// Every form other than tasks and debts (taskPanel.ts, debtForms.ts) opens
// the same way: on medium screens and up as a 560px side peek over the
// current page, the URL saying so (/baskets/b1?peek=basket-item&p_basket=b1);
// on a phone, as the form's own full page. PanelHost renders the peek, and
// sends a phone that opens such a link to the page instead. Closing,
// saving or cancelling replaces the history entry, so Back never returns
// into a form. Pure (tested in test/forms.test.ts); the opener is
// useFormLink.ts.

export const PEEK_PARAM = 'peek';
const PREFIX = 'p_';

export type FormKind =
  | 'basket-item'
  | 'basket'
  | 'edit-basket'
  | 'transaction'
  | 'edit-transaction'
  | 'edit-transfer'
  | 'category'
  | 'edit-category'
  | 'wallet'
  | 'template'
  | 'section'
  | 'area'
  | 'project'
  | 'cover'
  | 'import'
  | 'reallocate';

type Params = Record<string, string | null | undefined>;

const enc = encodeURIComponent;
const q = (params: Params, keys: string[]) => {
  const sp = new URLSearchParams();
  for (const k of keys) if (params[k]) sp.set(k, params[k]!);
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** Each form's own page (what a phone always opens, and "Open as full page"). */
const PAGES: Record<FormKind, (p: Params) => string> = {
  'basket-item': (p) => (p.item ? `/edit-basket-item/${enc(p.basket!)}/${enc(p.item)}` : `/add-basket-item/${enc(p.basket!)}`),
  basket: (p) => `/baskets/new${q(p, ['type'])}`,
  'edit-basket': (p) => `/baskets/${enc(p.id!)}/edit`,
  transaction: (p) => `/add-transaction${q(p, ['type', 'month', 'year', 'categoryId', 'templateId', 'bucketItem'])}`,
  'edit-transaction': (p) => `/edit-transaction/${enc(p.id!)}`,
  'edit-transfer': (p) => `/edit-transfer/${enc(p.id!)}`,
  category: (p) => `/create-category${q(p, ['returnTo'])}`,
  'edit-category': (p) => `/categories/${enc(p.id!)}/edit`,
  wallet: (p) => `/wallets/${enc(p.id!)}/edit`,
  template: (p) => (p.id ? `/transaction-templates/${enc(p.id)}/edit` : '/transaction-templates/new'),
  section: (p) => (p.id ? `/sections/${enc(p.id)}/edit` : `/sections/new${q(p, ['areaId'])}`),
  area: (p) => (p.id ? `/areas/${enc(p.id)}/edit` : '/areas/new'),
  project: (p) => (p.id ? `/projects/${enc(p.id)}/edit` : `/projects/new${q(p, ['areaId'])}`),
  import: (p) => `/settings/import${q(p, ['project'])}`,
  cover: (p) => `/budget/cover${q(p, ['month', 'bucket', 'item'])}`,
  reallocate: (p) => `/budget/reallocate${q(p, ['month', 'bucket', 'item'])}`,
};

export const FORM_KINDS = Object.keys(PAGES) as FormKind[];

export function isFormKind(value: string | null): value is FormKind {
  return FORM_KINDS.includes(value as FormKind);
}

export function formPageHref(kind: FormKind, params: Params = {}): string {
  return PAGES[kind](params);
}

/** The current page with the form open in a side peek. */
export function formPeekHref(pathname: string, search: string, kind: FormKind, params: Params = {}): string {
  const sp = new URLSearchParams(withoutFormPeek('', search).replace(/^\?/, ''));
  sp.set(PEEK_PARAM, kind);
  for (const [k, v] of Object.entries(params)) if (v) sp.set(PREFIX + k, v);
  return `${pathname}?${sp.toString()}`;
}

/** The form's own params from a peek URL. */
export function peekParams(search: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  search.forEach((value, key) => {
    if (key.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = value;
  });
  return out;
}

/** The current URL without the peek. */
export function withoutFormPeek(pathname: string, search: string): string {
  const sp = new URLSearchParams(search.replace(/^\?/, ''));
  sp.delete(PEEK_PARAM);
  for (const key of [...sp.keys()]) if (key.startsWith(PREFIX)) sp.delete(key);
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/**
 * The page's query with a peek's own params (p_*) read under their plain
 * names, for logic that reads window.location.search directly.
 */
export function peekAwareParams(search: string): URLSearchParams {
  const sp = new URLSearchParams(search.replace(/^\?/, ''));
  const out = new URLSearchParams();
  sp.forEach((value, key) => {
    if (!key.startsWith(PREFIX)) out.set(key, value);
  });
  sp.forEach((value, key) => {
    if (key.startsWith(PREFIX)) out.set(key.slice(PREFIX.length), value);
  });
  return out;
}
