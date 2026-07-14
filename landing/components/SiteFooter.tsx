import Link from "next/link";

/** Shared footer — every page links the store-required support and legal pages. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2" aria-label="Site">
          <Link
            href="/support"
            className="text-sm font-medium text-slate-500 hover:text-brand-600"
          >
            Support
          </Link>
          <Link
            href="/privacy"
            className="text-sm font-medium text-slate-500 hover:text-brand-600"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-sm font-medium text-slate-500 hover:text-brand-600"
          >
            Terms of Service
          </Link>
        </nav>
        <p className="text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} ReloGo &middot; Made for movers
          across Canada
        </p>
      </div>
    </footer>
  );
}
