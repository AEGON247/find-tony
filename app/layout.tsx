import type { Metadata, Viewport } from "next";
import { Bangers, Inter } from "next/font/google";
import "./globals.css";

const displayFont = Bangers({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Find Tony // Sydney",
  description: "Find food, events, and places to hang out around Sydney.",
  applicationName: "Find Tony",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Find Tony" },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
