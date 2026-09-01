# Dreda: auth service PRD (Firebase Authentication)

## 1. What this document changes

This replaces sections 4 through 9 of `PRD-BACKEND.md` ("The one thing to get right", the
Apps Script `Users` tab and `auth.*` actions as originally specced, the library list, env vars,
provider setup, and the screen-by-screen auth flow). Everything else in `PRD-BACKEND.md`, the
context, goals, non-goals, the screen-to-ledger-action wiring table, the PWA section, and the
overall acceptance criteria and build order, still stands and this document does not repeat it.

The decision: use Firebase Authentication as the identity provider for email/password sign-in
and for both third-party flows (Google and Apple), instead of hand-rolling password hashing and
an Auth.js Credentials provider. Firebase Authentication only, not Firestore, not Realtime
Database, not Cloud Functions. The ledger stays exactly where it is, in the Google Sheet, behind
Apps Script, behind the existing shared secret. Firebase's only job is: who is this person, and
proving it cryptographically. Nothing about the ledger's Sheets-first design changes.

## 2. Why this is a clean fit, and where the boundary sits

Firebase Authentication handles password hashing and storage, brute-force lockout, email
verification, and password reset entirely on its own, none of that needs building or testing by
hand anymore. It also already knows how to broker Google and Apple sign-in, including Apple's
one-time-only name sharing quirk (see section 7).

What Firebase does not know about, and never will: the 5-digit PIN quick-unlock, and whether a
person's access to this specific household app has been revoked independent of their Firebase
account existing. Those two things stay in the Google Sheet, in a much smaller `Users` tab than
the one originally specced, keyed by the Firebase UID instead of a Sheet-generated id.

Two layers, same as before, just with Firebase in Auth.js's old slot:

Layer A, browser: the Firebase Web SDK (`firebase/auth`) runs sign-up, sign-in, and both OAuth
flows directly against Firebase's servers. This never touches Apps Script and never touches the
Next.js server, it is a direct browser-to-Firebase relationship.

Layer B, Next.js server: after the browser has a Firebase ID token, it POSTs that token to a new
route. The server verifies it with `firebase-admin` (Node runtime only, this SDK cannot run on
the Edge), mints an httpOnly session cookie, and calls Apps Script to upsert the `Users` row. From
here on the existing shared-secret pipeline to Apps Script is completely unchanged, Apps Script
never talks to Firebase and never verifies a token itself, it trusts the Next.js server the same
way it always has.

## 3. Firebase project setup (manual, one time, document the steps, do not automate)

Create a Firebase project (the free Spark plan covers everything here, Authentication does not
require the paid Blaze plan, only Cloud Functions and a few other products do, and this PRD uses
none of those).

Authentication > Sign-in method: enable **Email/Password**, enable **Google** (Firebase
provisions the OAuth client for you, no separate Google Cloud Console step needed for this one),
enable **Apple**.

Apple still needs everything section 8 of `PRD-BACKEND.md` already flagged: an active Apple
Developer Program membership (paid annually, the one real external cost here), a Services ID with
Sign in with Apple enabled, and a Sign in with Apple private key (Team ID, Key ID, the `.p8` file
contents). Enter all three into Firebase's Apple provider configuration screen instead of into
Auth.js env vars. Firebase shows you its own redirect URI during this setup
(`https://<project-id>.firebaseapp.com/__/auth/handler`), register that exact URI back in the
Apple Developer portal's Services ID configuration.

Authentication > Settings > Authorized domains: add the ngrok domain used for local testing.
`localhost` is allowed by default.

Project Settings > Service Accounts > Generate new private key: downloads a JSON file for
`firebase-admin`. Treat it exactly like the Apps Script shared secret, never commit it, pull the
three fields you need (project id, client email, private key) into server-only env vars.

## 4. Slim `Users` tab (replaces the version originally specced in `PRD-BACKEND.md` section 5)

| Column | Type | Notes |
|---|---|---|
| UID | text | Firebase Auth uid, primary key, not a Sheet-generated id anymore |
| Email | text | mirrored from Firebase, for a human glancing at the Sheet |
| Name | text | display name, see the Apple caveat in section 7 |
| PinHash | text | bcrypt hash of the 5-digit PIN, empty until set |
| CreatedAt | datetime | first time this uid was seen by the Next.js server |
| LastLoginAt | datetime | updated on every verified session |
| Archived | boolean | revokes this household app's access without touching the Firebase account itself |

Everything the original schema had for passwords and OAuth (`PasswordHash`, `GoogleSub`,
`AppleSub`, `FailedLoginAttempts`, `LockedUntil`) is gone, Firebase already tracks all of it and
already rate-limits repeated failures on its own.

New Apps Script actions, replacing the `auth.*` set from the superseded sections, same envelope
and `LockService` conventions as the rest of `Code.gs`:

- `auth.upsertUser` payload `{uid, email, name}`. Creates the row if missing, otherwise updates
  `Email`, `Name` (only if a non-empty name was passed, see section 7), and `LastLoginAt`. Returns
  the row, including `Archived` and whether `PinHash` is set. The Next.js session route calls this
  right after verifying a token, and refuses to set the session cookie if `Archived` is true, even
  though Firebase itself already authenticated the person.
- `auth.getPinHash` payload `{uid}`.
- `auth.setPin` payload `{uid, pinHash}` (already hashed by the Next.js server, same as before,
  Apps Script still never runs any crypto, it only stores and returns hash strings).

## 5. Libraries and env vars

Add: `firebase` (client SDK, used from client components), `firebase-admin` (server SDK, used
only inside Node-runtime route handlers). Drop `next-auth` from the plan entirely, it is not
needed. Keep `bcryptjs`, still used for the PIN. Keep `zod`.

Client-side config (these are not secret, Firebase's own docs are explicit that this config is
meant to be public, the browser needs it to even talk to Firebase, security comes from Firebase's
own rules and token verification, not from hiding this object):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Server-only, never `NEXT_PUBLIC_`, never sent to the client, never logged:

```
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

(`FIREBASE_ADMIN_PROJECT_ID` can just reuse the public project id value above, the project id
itself is not sensitive, only the private key and client email pair used to sign as that service
account are.)

## 6. Screen-by-screen changes

### Sign up (`src/screens/SignUp`, `src/logic/signUp/useLogic.ts`)
Add a Name field to the form, it does not exist today and Settings needs a real display name to
show. `handleSubmit` calls Firebase's `createUserWithEmailAndPassword`, then `updateProfile` with
the entered name, then hands the resulting ID token to the new `app/api/auth/session` route
(section 8). `handleOAuth('google'|'apple')` replaces the notice-only stub with
`signInWithRedirect` (not `signInWithPopup`, see section 7 for why), using `GoogleAuthProvider`
and `new OAuthProvider('apple.com')` respectively, the Apple provider additionally needs
`.addScope('email')` and `.addScope('name')`.

### Sign in (`src/screens/SignIn`, `src/logic/signIn/useLogic.ts`)
Currently has no OAuth buttons at all, only Sign Up does, that is a real gap: a person who signed
up with Google has no way back in from this screen. Add the same Google and Apple button group
here, pull the button markup out of `SignUpScreen` into a small shared component (e.g.
`src/widgets/OAuthButtons`) both screens import, rather than duplicating the SVG and handlers.
`handleSubmit` calls `signInWithEmailAndPassword`, surfaces Firebase's own error codes
(`auth/wrong-password`, `auth/too-many-requests`, etc.) inline near the password field instead of
a custom lockout message, Firebase already enforces its own throttling. Add a "Forgot password"
link that calls `sendPasswordResetEmail`, this is now free, no reason to skip it.

### Session bootstrap (both screens, after any successful Firebase sign-in)
Both flows converge on the same step: get the ID token (`user.getIdToken()`), POST it to
`app/api/auth/session`, which verifies it, mints the cookie, calls `auth.upsertUser`, and returns
whether `PinHash` is already set. Route to `/pin` either way, the PIN screen itself branches
between "verify" and "set for the first time" based on that flag, unchanged from the original
design.

### PIN (`src/logic/pin/useLogic.ts`)
Unchanged in shape from `PRD-BACKEND.md`'s original design, just keyed by Firebase `uid` (read
from the verified session) instead of a Sheet-generated user id.

### Settings (`src/logic/settings/useLogic.ts`)
`USER` (name, email) now comes straight from the Firebase client SDK's current user object, no
Apps Script round trip needed for that part. `handleSignOut` calls Firebase's `signOut()`, clears
the session cookie (a small `DELETE` on `app/api/auth/session`), and clears the PIN's
sessionStorage flag, all three, in that order. Still delete `INITIAL_NOTION_API_KEY` and its
plaintext-key UI block per the original PRD, unrelated to this change but still true.

## 7. Two provider-specific things to get right

Apple only shares the person's name on the very first authorization ever, silently omitting it on
every later sign-in even for the same account. `auth.upsertUser` must not overwrite a real stored
`Name` with an empty one, only set `Name` when a non-empty value is actually passed, which is
exactly what section 4's action description says, worth restating here because it is easy to get
backwards.

`signInWithRedirect`, not `signInWithPopup`, for both Google and Apple. This app runs installed as
a standalone PWA, and popups are unreliable or blocked outright in standalone mode on iOS Safari
specifically. Use `getRedirectResult()` on the page the user lands back on to pick up the signed-in
user after the redirect completes.

## 8. Route protection

`middleware.ts` (Edge runtime): a cheap presence check on the session cookie only, no
verification, redirect to `/sign-in` if it's simply missing. This is a UX redirect, not the
security boundary, `firebase-admin` cannot run on the Edge runtime so real verification does not
belong here.

Every route handler that needs to know who the person actually is (the session route itself,
`auth.getPinHash`/`auth.setPin` callers, and later anything per-user) runs on the Node runtime
(`export const runtime = 'nodejs'`) and calls `getAuth(adminApp).verifySessionCookie(cookie, true)`
before doing anything else. That call is the real security boundary. When the PWA is offline, the
service worker serves cached pages without a request ever reaching the server, so this split does
not block the "airplane mode still shows the last-synced Home dashboard" requirement from
`PRD-BACKEND.md` section 11, middleware and route verification simply do not run for a
service-worker-served response.

## 9. Testing

Use the Firebase Local Emulator Suite (`firebase emulators:start --only auth`) for development and
for automated tests, so sign-up and sign-in flows can be exercised without live network calls or
hitting real quota, point the client SDK at it with `connectAuthEmulator` only when
`NODE_ENV !== 'production'`.

Apps Script side: extend the existing `Code.gs` test pattern with cases for `auth.upsertUser`
(create, update-preserves-existing-name-on-empty-input, archived-user flag surfaced correctly) and
`auth.getPinHash`/`auth.setPin`, same mock-`SpreadsheetApp` approach already used for the ledger
actions.

## 10. Acceptance criteria

Sign up with email and password, including the new Name field, lands on the PIN setup screen.
Sign in with email and password works, and shows Firebase's own error text for a wrong password
without the app inventing its own copy. Sign in and sign up both offer, and correctly complete,
Google and Apple redirect flows, including on an installed iOS home-screen PWA specifically (this
is the one that silently breaks if `signInWithPopup` sneaks back in). Forgot-password email
arrives and its link works end to end. Signing out clears the Firebase client session, the server
cookie, and the PIN flag, verified by confirming a relaunch afterward lands on Sign In, not PIN.
An `Archived` row in the `Users` tab blocks that person's session from being issued even though
Firebase itself still authenticates them, confirm this with a manual test: flip `Archived` to true
for a test account, confirm their next sign-in is refused. Grep the built `.next` output for
`FIREBASE_ADMIN_PRIVATE_KEY` and `FIREBASE_ADMIN_CLIENT_EMAIL`, confirm neither ever appears
client-side, same check the original PRD already required for the Apps Script shared secret.

## 11. Build order

1. Firebase project setup per section 3, Email/Password provider only to start (Google and Apple
   need their own provider-console side quests and can follow once this works end to end).
2. `app/api/auth/session` route (Node runtime), `firebase-admin` init, the slim `Users` tab and
   its two-and-a-half actions (`auth.upsertUser`, `auth.getPinHash`, `auth.setPin`) plus their
   tests.
3. Sign up and sign in screens wired to email/password, the shared `OAuthButtons` component built
   but not yet wired to real providers, `middleware.ts`.
4. Google provider end to end.
5. Apple provider end to end, start the Developer Program membership immediately if not already
   active, same note as the original PRD, it is the slowest external dependency.
6. Forgot-password flow.
7. Full acceptance pass per section 10, then resume `PRD-BACKEND.md`'s own build order from its
   PWA section onward.
