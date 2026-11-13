import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Clear Desk Dallas", template: "%s · Clear Desk Dallas" },
  description: "Client portal for Clear Desk Dallas.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-white">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
