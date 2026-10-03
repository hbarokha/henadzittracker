import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import { Bebas_Neue, Syne, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight:  "400",
  variable: "--font-hero",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight:  ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight:  ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight:  ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HenadziTracker",
  description: "Daily health & nutrition tracker",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Tracker", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c0a08",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${syne.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
