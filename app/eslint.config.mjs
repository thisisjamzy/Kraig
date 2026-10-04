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
  {
    files: ["src/phone/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/src/routes/*"], message: "The phone line doesn't import the route switches (docs/UI-LINES.md)." }] }],
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
