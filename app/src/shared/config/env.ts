// Centralized environment access. Do not call process.env directly anywhere else.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  // Public by design — Firebase's own docs are explicit that this config is meant to be
  // public, the browser needs it to talk to Firebase at all. Security comes from
  // Firebase's own rules and server-side token verification, not from hiding this object.
  // See PRD-AUTH-FIREBASE.md section 5.
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    // Opt-in only (PRD-AUTH-FIREBASE.md section 9 suggests always-on outside production,
    // but that would silently redirect a normal `npm run dev` at a real Firebase project
    // into the emulator the moment someone sets NODE_ENV=development, with no obvious
    // signal why sign-in stopped working — an explicit flag avoids that footgun).
    useEmulator: process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === 'true',
  },
};

export { required };
