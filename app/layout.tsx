import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CookieConsent from "./cookie-consent";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "KCBL FinCon Suite", template: "%s | KCBL FinCon Suite" },
  description: "Project Financial Control & Performance Management System",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#062846" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans"><a href="#main-content" className="skip-link">Skip to main content</a>{children}<CookieConsent /></body>
    </html>
  );
}
