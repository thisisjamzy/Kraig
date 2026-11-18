# Pre-login screens (archived 16 Nov 2026)

Everything a visitor saw before signing in, kept for reference. Nothing here
is built: it sits outside `app/`, and the app's front door is now `/sign-in`.

- `src/screens/Marketing`, `src/widgets/Marketing`, `src/logic/marketing`:
  the marketing site shown at `/` in a regular browser.
- `src/screens/Splash`: the installed app's splash for a device that had
  never signed in.
- `src/screens/AppEntry`, `src/logic/appEntry`: the old `/` router that chose
  between them.

To bring one back, move it into `app/src` at the same path and route `/` to
it again (`app/app/page.tsx`, `app/proxy.ts`).
