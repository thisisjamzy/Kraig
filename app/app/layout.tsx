import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono, Inter, Poppins } from "next/font/google";
import { ThemeProvider } from '@/src/shared/components/ThemeProvider/ThemeProvider';
import "@/src/styles/base/globals.css";

// Self-hosted via next/font (no runtime request to Google, no
// flash-of-fallback) — exposed as CSS custom properties that globals.css's
// own --font-family-body/--font-family-heading read directly, so every
// screen already using those tokens picks the real typeface up for free.
// Inter existed only as a font-family name before this — nothing actually
// loaded it, so the app was silently rendering in each OS's system font.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});
// The style guide's faces (src/styles/tokens/styleGuide.ts), used on the
// phone (globals.css): Bricolage Grotesque headings, Figtree body, IBM
// Plex Mono amounts.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-mono", display: "swap" });




export const metadata: Metadata = {
  title: "Dreda",
  description:
    "A fast mobile capture screen for the Notion databases you already track tasks and budgets in.",
  // apple-touch-icon.png is referenced here, not app/manifest.ts — iOS Safari
  // ignores the manifest's icons array entirely (see public/icons/README.md).
  icons: {
    apple: '/icons/apple-touch-icon.png?v=3',
  },
  appleWebApp: {
    capable: true,
    title: 'Dreda',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${poppins.variable} ${bricolage.variable} ${figtree.variable} ${plexMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
