import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleHelp, Mail, ShieldAlert } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import { SUPPORT_EMAIL } from "@/lib/support";

const SUPPORT_TITLE = "Support - ReloGo";
const SUPPORT_DESCRIPTION =
  "Get help with the ReloGo app, your checklist, support conversation, or the website waitlist.";

export const metadata: Metadata = {
  title: SUPPORT_TITLE,
  description: SUPPORT_DESCRIPTION,
  alternates: {
    canonical: "/support",
  },
  openGraph: {
    title: SUPPORT_TITLE,
    description: SUPPORT_DESCRIPTION,
    siteName: "ReloGo",
    url: "/support",
    type: "website",
    locale: "en_CA",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: SUPPORT_TITLE,
    description: SUPPORT_DESCRIPTION,
    images: ["/og.png"],
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-slate-600">
        {children}
      </div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-hero-gradient">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ReloGo
        </Link>
        <span className="text-xl font-bold tracking-tight text-slate-900">
          Relo<span className="text-brand-600">Go</span>
        </span>
      </header>

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          ReloGo Support
        </h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          Help with the mobile app, your checklist, support conversation,
          or the website waitlist.
        </p>

        <div className="mt-8 flex gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
          <CircleHelp
            className="h-7 w-7 shrink-0 text-brand-600"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">
              For app questions, start in ReloGo:
            </span>{" "}
            open the Move tab and tap Human support, then choose one of the
            prepared questions. A human support team member can reply there.
          </p>
        </div>

        <Section title="Get help in the app">
          <ol className="ml-5 list-decimal space-y-2">
            <li>Open the Move tab and tap Human support.</li>
            <li>Choose the prepared question that best matches your issue.</li>
            <li>
              Reopen Help later to see the conversation and any human reply.
            </li>
          </ol>
          <p>
            Support questions are intentionally limited to general, prepared
            options. This helps keep names, addresses, dates of birth, and
            government document numbers out of support messages.
          </p>
        </Section>

        <Section title="Contact us">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <Mail
              className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <div>
              {SUPPORT_EMAIL ? (
                <p>
                  For website, waitlist, privacy, or accessibility help, email{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=ReloGo%20support`}
                    className="font-medium text-brand-600 hover:text-brand-700"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              ) : (
                <p>
                  Public email support is still being configured for this
                  preview. App users can use the in-app Support tab; the
                  waitlist must not leave preview until a monitored privacy and
                  accessibility channel is published here.
                </p>
              )}
              {SUPPORT_EMAIL ? (
                <p className="mt-2 text-sm text-slate-500">
                  Tell us whether you use iOS or Android and describe the issue
                  in general terms. Do not email completed government forms or
                  sensitive identity details.
                </p>
              ) : null}
            </div>
          </div>
        </Section>

        <Section title="Move data and support chats">
          <p>
            Move details and checklist checkmarks stay on the device. To clear
            them, open the Move tab and choose{" "}
            <span className="font-medium text-slate-900">
              Clear this device&apos;s checklist
            </span>
            . This does not remove a support conversation stored on our server.
            The current app has no self-service chat deletion control; contact
            options for privacy requests are listed below.
          </p>
          <p>
            {SUPPORT_EMAIL
              ? "To remove a website waitlist entry, email us from the address you used to join. "
              : "A public waitlist-removal channel is required before launch. "}
            For more detail about what ReloGo stores, read our{" "}
            <Link
              href="/privacy"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Checklist and deadline questions">
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              ReloGo is a planning aid, not a government service. Requirements,
              fees, and deadlines can change or depend on your circumstances.
              Always confirm important details using the official government
              link shown with each task.
            </p>
          </div>
        </Section>
      </article>

      <SiteFooter />
    </main>
  );
}
