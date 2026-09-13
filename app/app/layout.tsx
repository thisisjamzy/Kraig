import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
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




export const metadata: Metadata = {
  title: "Dreda",
  description:
    "A fast mobile capture screen for the Notion databases you already track tasks and budgets in.",
  // apple-touch-icon.png is referenced here, not app/manifest.ts — iOS Safari
  // ignores the manifest's icons array entirely (see public/icons/README.md).
  icons: {
    apple: '/icons/apple-touch-icon.png',
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
      className={`h-full antialiased ${inter.variable} ${poppins.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
