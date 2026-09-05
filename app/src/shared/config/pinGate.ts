// The 5-digit PIN is a "quick unlock" bound to the signed-in account, the
// real check runs client-side against users/{uid}/private/pin
// (src/shared/config/pinCallable.ts), behind firestore.rules — there's no
// Next.js route or Cloud Function left in this path (PRD-FIREBASE.md
// section 1, section 10's corrected version). Two flags track "verified
// this session", kept in sync with each other:
//  - PIN_VERIFIED_KEY, a sessionStorage flag PinGuard reads for an instant
//    client-side gate — cleared when the browser/app session ends.
//  - a same-named, plain (non-httpOnly) session cookie (no maxAge) that
//    proxy.ts's Edge middleware checks before letting a (mobile) route
//    through at all, since sessionStorage isn't readable there. Set
//    alongside the sessionStorage flag by src/logic/pin/useLogic.ts's
//    unlockAndGoHome and src/logic/settings/useLogic.ts's PIN-change flow —
//    neither is the real security boundary (Firestore Security Rules are),
//    see clientCookies.ts's header.
export const PIN_VERIFIED_KEY = 'dreda-pin-verified';
export const PIN_LENGTH = 5;

// Set by src/logic/signUp/useLogic.ts right before it routes a freshly
// created (password) account to /pin, so that screen opens straight into
// "create your PIN" mode instead of trying — and failing — a verify first.
// Read once and cleared by src/logic/pin/useLogic.ts on mount.
export const PIN_CREATE_HINT_KEY = 'dreda-pin-create-hint';

// The bcrypt PIN hash, cached in localStorage after a successful server
// verify/set (src/logic/pin/useLogic.ts) so a later PIN entry can be
// checked instantly and offline via bcryptjs in the browser — a hash is
// safe to keep client-side by design, it's one-way, this is not the PIN
// itself. Cleared on sign-out (src/logic/settings/useLogic.ts) so it
// doesn't outlive the session it belongs to on a shared device.
export const PIN_HASH_CACHE_KEY = 'dreda-pin-hash-cache';

// Settings' "Require PIN" toggle (src/logic/settings/useLogic.ts) — this
// local mirror (both localStorage, for src/logic/appEntry/useLogic.ts, and
// a plain cookie, for proxy.ts's Edge middleware, which can't read
// Firestore) is what actually lets a device skip the PIN screen instantly;
// the account-wide source of truth is settings.pinDisabled in Firestore
// (see FirestoreSettings), which src/logic/pin/useLogic.ts syncs this flag
// from on a device that hasn't toggled it locally yet (e.g. a second
// device, after disabling it on the first). Persists like SIGNED_IN_KEY
// (no maxAge scoping the way PIN_VERIFIED_KEY has) — it's a standing
// per-device preference, not a per-session unlock.
export const PIN_DISABLED_KEY = 'dreda-pin-disabled';
