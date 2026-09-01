// Human-readable names for currency codes, used only to label whatever
// currencies.list actually returns (the codes configured in the
// ExchangeRates tab) — this is not itself the list of selectable currencies,
// picking one not configured there is rejected by settings.setDisplayCurrency.
const CURRENCY_NAMES: Record<string, string> = {
  XAF: 'Central African CFA franc',
  XOF: 'West African CFA franc',
  NGN: 'Nigerian naira',
  GHS: 'Ghanaian cedi',
  KES: 'Kenyan shilling',
  ZAR: 'South African rand',
  EGP: 'Egyptian pound',
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'British pound',
  CAD: 'Canadian dollar',
  AUD: 'Australian dollar',
  JPY: 'Japanese yen',
  CNY: 'Chinese yuan',
  INR: 'Indian rupee',
  BRL: 'Brazilian real',
  MXN: 'Mexican peso',
  CHF: 'Swiss franc',
  SEK: 'Swedish krona',
  AED: 'UAE dirham',
};

export function currencyName(code: string) {
  return CURRENCY_NAMES[code] ?? code;
}
