import { stringConstants } from './stringConstants';

// The single access point screens use to read copy. Trivial today, but it's
// the seam that would let this swap to a locale-aware source later without
// touching every screen.
export function useStrings() {
  return stringConstants;
}
