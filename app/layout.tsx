import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CookieConsent from "./cookie-consent";
import ThemeToggle from "./theme-toggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://fincon.kcbl.com",
  ),
  title: { default: "KCBL FinCon Suite", template: "%s | KCBL FinCon Suite" },
  description: "Project Financial Control & Performance Management System",
  openGraph: {
    title: "KCBL FinCon Suite",
    description: "Project Financial Control & Performance Management System",
    images: ["/kcbl-logo-full.png"],
  },
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
      <body className="font-sans">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="fixed right-4 top-4 z-30 md:hidden">
          <ThemeToggle />
        </div>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
