import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Finance Dashboard", template: "%s · Finance Dashboard" },
  description:
    "Personal finance dashboard for budgets, investments, net worth and forecasts.",
};

export const viewport: Viewport = {
  // Lets the mobile tab bar extend under the home indicator (it pads itself with the safe-area inset).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The init script sets the theme class before React hydrates, so <html> attributes differ from the server render.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
