// Maps Firebase Auth's own error codes to a readable sentence — not a
// custom lockout/attempt-counting system of our own, Firebase already
// enforces that (PRD-AUTH-FIREBASE.md section 6). Falls back to the SDK's
// own message for anything not explicitly called out here, rather than
// inventing copy for every possible code.

import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/network-request-failed': 'Could not reach the server. Check your connection and try again.',
};

export function firebaseErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
