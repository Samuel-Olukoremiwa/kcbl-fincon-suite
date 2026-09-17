import Image from "next/image";
import LoginForm from "./login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      {/* A single grounded signature element: a left-edge rule in the
          amber accent, echoing a site-plan margin line — quiet, but
          specific to a construction-company tool rather than a generic
          card shadow. */}
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/kcbl-logo-full.png"
            alt="Kens Creative Builders Limited"
            width={112}
            height={112}
            priority
            className="mb-4"
          />
          <h1 className="text-2xl font-semibold text-white">
            FinCon Suite
          </h1>
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
        <nav aria-label="Legal information" className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-white/60"><Link href="/privacy-policy" className="hover:text-white">Privacy</Link><Link href="/terms" className="hover:text-white">Terms</Link><Link href="/cookie-policy" className="hover:text-white">Cookies</Link><Link href="/refund-policy" className="hover:text-white">Refund policy</Link></nav>
      </div>
    </main>
  );
}
