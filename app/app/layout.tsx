import type { Metadata, Viewport } from "next";
import { ThemeProvider } from '@/src/shared/components/ThemeProvider/ThemeProvider';
import "@/src/styles/base/globals.css";




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
      className={`h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
