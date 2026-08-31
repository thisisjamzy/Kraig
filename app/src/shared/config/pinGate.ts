// The 5-digit PIN is a "quick unlock" bound to the signed-in account, with
// the real check happening server-side against Firestore (see
// app/api/auth/pin/verify, .../pin/set, and src/shared/config/
// firestoreUsers.ts — all user data, PIN included, lives solely in Firebase,
// never in the Google Sheet). Two flags track "verified this session", kept
// in sync with each other:
//  - PIN_VERIFIED_KEY, a sessionStorage flag PinGuard reads for an instant
//    client-side gate — cleared when the browser/app session ends.
//  - a same-named, httpOnly session cookie (no maxAge) that proxy.ts checks
//    server-side before letting a (mobile) route through at all, since
//    sessionStorage isn't readable from the server. Set alongside the
//    sessionStorage flag by app/api/auth/pin/verify and .../pin/set.
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
