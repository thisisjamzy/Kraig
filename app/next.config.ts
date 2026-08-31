import type { NextConfig } from "next";
import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets the dev server's JS bundles and HMR socket load when the app is opened
  // through an ngrok tunnel (for testing on a phone), not just from localhost.
  allowedDevOrigins: ['*.ngrok-free.dev', '*.ngrok-free.app', '*.ngrok.io', '*.ngrok.app'],
  // Hide the dev-only route indicator badge — it overlaps the app's own bottom nav.
  devIndicators: false,
  // @ducanh2912/next-pwa (below) always attaches a `webpack` config function,
  // which Next.js 16 otherwise refuses to start under — dev or build — since
  // Turbopack is the default bundler and doesn't run webpack config at all.
  // An empty `turbopack` key tells Next.js this was noticed and is fine: `npm
  // run dev` still uses fast Turbopack (next-pwa is disabled in development
  // anyway, see below, so there's nothing for it to actually do there); `npm
  // run build` still needs the `--webpack` flag (see package.json) so
  // next-pwa's service-worker generation actually runs for production.
  turbopack: {},
};

//
// PRD-FIREBASE.md section 15. `runtimeCaching` (aliased from the package's
// internal `defaultCache`) is spread in last, so these app-specific rules
// take precedence for the paths they match, and everything else keeps the
// package's own sane defaults (fonts, next/image, RSC pages, etc.). Ledger
// data itself (accounts/transactions/stats/...) no longer goes through the
// service worker's cache at all — Firestore's own persistentLocalCache
// (see src/shared/config/firebaseClient.ts) handles offline reads/writes
// directly, which is why the old apps-script-sync NetworkFirst rule that
// used to live here is gone.
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /\/icons\/.*|\/mockups\/.*|\/logo(?:mark)?_[^/]+\.(?:png|jpg|jpeg|svg)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'dreda-brand-assets',
          expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'next-build-assets',
          expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
      ...defaultRuntimeCaching,
    ],
  },
  // Full-page-navigation offline fallback only (see app/~offline/page.tsx) —
  // API routes are excluded from this and instead show cached data or an
  // inline "you're offline" state, never a redirect to a fallback page.
  fallbacks: {
    document: '/~offline',
  },
});

export default withPWA(nextConfig);
