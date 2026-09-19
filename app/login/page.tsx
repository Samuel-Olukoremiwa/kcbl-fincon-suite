import Image from "next/image";
import LoginForm from "./login-form";
import Link from "next/link";
import ThemeToggle from "@/app/theme-toggle";
import { ShieldCheck, TrendingUp, Users2 } from "lucide-react";

const highlights = [
  {
    icon: ShieldCheck,
    title: "Maker-checker approvals",
    body: "Every inflow and outflow moves through a role-based approval queue with a full audit trail.",
  },
  {
    icon: TrendingUp,
    title: "Live financial position",
    body: "Approved transactions feed a real-time picture of cash position across every active project.",
  },
  {
    icon: Users2,
    title: "Client & KYC built in",
    body: "Individual and company intake, source-of-funds, and staff-only risk assessment in one place.",
  },
];

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-900 px-4 py-10 lg:justify-start lg:px-0 lg:py-0">
      <div className="fixed right-4 top-4 z-30">
        <ThemeToggle />
      </div>

      {/* Desktop-only brand panel */}
      <div className="relative hidden h-screen w-1/2 shrink-0 overflow-hidden bg-navy-900 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="bg-blueprint-grid pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="animate-glow-drift pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-amber/20 blur-3xl"
          aria-hidden
        />
        <div
          className="animate-glow-drift pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber/10 blur-3xl"
          style={{ animationDelay: "3s" }}
          aria-hidden
        />

        <div className="relative animate-fade-up">
          <div className="mb-10 flex items-center gap-3">
            <Image src="/kcbl-mark.png" alt="" width={40} height={40} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">KCBL</p>
              <p className="text-xs uppercase tracking-[0.2em] text-amber">FinCon Suite</p>
            </div>
          </div>

          <h2 className="mb-3 max-w-md text-3xl font-semibold leading-tight text-white">
            Project financial control, without the spreadsheet chaos.
          </h2>
          <p className="mb-10 max-w-sm text-sm text-white/60">
            Built for KCBL&apos;s construction finance workflow — from client
            intake to approved transaction, in one system.
          </p>

          <ul className="max-w-sm space-y-6">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/10 text-amber">
                  <Icon size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-white/55">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Login panel */}
      <div className="relative flex w-full items-center justify-center lg:h-screen lg:w-1/2">
        <div className="bg-blueprint-grid pointer-events-none absolute inset-0 lg:hidden" aria-hidden />
        <div
          className="animate-glow-drift pointer-events-none absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-amber/20 blur-3xl lg:hidden"
          aria-hidden
        />

        <div className="animate-fade-up relative w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Image
              src="/kcbl-logo-full.png"
              alt="Kens Creative Builders Limited"
              width={112}
              height={112}
              priority
              className="mb-4"
            />
            <h1 className="text-2xl font-semibold text-white">FinCon Suite</h1>
            <p className="mt-1 text-sm text-white/60">
              Project Financial Control &amp; Performance Management
            </p>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="absolute inset-y-0 left-0 w-1 bg-amber" aria-hidden />
            <div className="p-8 pl-9">
              <LoginForm />
            </div>
          </div>
          <nav
            aria-label="Legal information"
            className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-white/60"
          >
            <Link href="/privacy-policy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/cookie-policy" className="hover:text-white">
              Cookies
            </Link>
            <Link href="/refund-policy" className="hover:text-white">
              Refund policy
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}