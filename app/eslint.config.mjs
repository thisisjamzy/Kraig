import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Two UI lines (docs/UI-LINES.md). The phone line (src/phone) is only
  // reached through the route switches (src/routes) and the phone shell in
  // app/(mobile)/layout.tsx; the phone line never imports the switches.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/phone/**", "src/routes/**", "app/(mobile)/layout.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/src/phone/*"], message: "The phone line is only reached through src/routes (docs/UI-LINES.md)." }] }],
    },
  },
  // The phone line never imports the web line: no web screens and no
  // web-only components (sidebar, top bar, Notion page, properties grid,
  // database views, side peek, masonry grid, tables). TopBarSlot and
  // breadcrumb are hooks that do nothing on a phone and stay allowed.
  {
    files: ["src/phone/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/src/routes/*"], message: "The phone line doesn't import the route switches (docs/UI-LINES.md)." },
            { group: ["@/src/screens/*"], message: "Web screens don't render on a phone; use or restore a phone screen in src/phone/screens (docs/UI-LINES.md)." },
            {
              group: [
                "@/src/widgets/Database/*",
                "@/src/widgets/AppShell/*",
                "!@/src/widgets/AppShell/TopBarSlot",
                "!@/src/widgets/AppShell/breadcrumb",
                "@/src/widgets/TaskDb/*",
                "@/src/widgets/ProjectDb/*",
                "@/src/widgets/ProjectTimeline/*",
                "@/src/widgets/TimeCalendar/*",
                "@/src/widgets/WebFormPanel/*",
                "@/src/widgets/Layout/ResponsivePage",
                "@/src/widgets/ReadyToPay/*",
              ],
              message: "Web-only component: phones under 768px render the BASELINE mobile UI (docs/mobile-restore-inventory.md).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
