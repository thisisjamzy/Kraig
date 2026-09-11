The Next.js 16 App Router application — see the [repo-root README](../README.md)
for the product tour, full app/Firebase architecture, and setup instructions.
`README-STRUCTURE.md` in this directory covers the code-layering rules, theme
system, and PWA setup in more depth.

## Running locally

```bash
npm run dev      # next dev — http://localhost:3000
npm run build    # next build --webpack (required for @ducanh2912/next-pwa's
                 # service-worker generation — see next.config.ts)
npm run lint     # eslint
```

Requires `.env.local` (copy `.env.local.example`) with your Firebase web app
config — see the root README's [Getting started](../README.md#getting-started).
