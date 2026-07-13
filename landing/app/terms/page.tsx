import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

// NOTE: This text should be reviewed by a lawyer before launch — it is a
// good-faith draft, not legal advice.
// Update this to a monitored address before publishing the store listings.
const CONTACT_EMAIL = "privacy@relogo.app";
const LAST_UPDATED = "July 13, 2026";

export const metadata: Metadata = {
  title: "Terms of Service - ReloGo",
  description:
    "The terms that govern your use of the ReloGo app and website.",
  alternates: {
    canonical: "/terms",
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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-hero-gradient">
      {/* Header */}
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

      {/* Body */}
      <article className="mx-auto max-w-3xl px-6 pb-24 pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

        {/* Highlight */}
        <div className="mt-8 flex gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
          <Scale
            className="h-7 w-7 shrink-0 text-brand-600"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">
              The short version:
            </span>{" "}
            ReloGo is a free planning tool that helps you organize the
            government tasks involved in an interprovincial move. It is an
            informational aid — not legal, financial, or immigration advice —
            and official government sources always take precedence over
            anything shown in the app.
          </p>
        </div>

        <Section title="Agreeing to these terms">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the
            ReloGo mobile application and the relogo.app website (together, the
            &ldquo;Service&rdquo;), operated by ReloGo (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating a checklist,
            joining the waitlist, or otherwise using the Service, you agree to
            these Terms and to our{" "}
            <Link
              href="/privacy"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Privacy Policy
            </Link>
            . If you do not agree, please do not use the Service.
          </p>
        </Section>

        <Section title="What ReloGo is (and is not)">
          <p>
            ReloGo builds a personalized checklist of common government tasks —
            such as licence exchanges, health card registration, and vehicle
            registration — based on the provinces you are moving between and
            the details you provide, with suggested deadlines and links to
            official government pages.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              ReloGo is an informational planning aid only.
            </span>{" "}
            It is not a government service and is not affiliated with any
            federal, provincial, or territorial government. Rules, deadlines,
            fees, and forms change, vary by personal circumstance, and may be
            summarized imperfectly. You are responsible for verifying every
            requirement and deadline against the official government source
            before relying on it. Nothing in the Service constitutes legal,
            financial, tax, medical, or immigration advice.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            The app creates an anonymous account for you — no email or password
            is required. Because the account is anonymous and your sensitive
            details are stored only on your device, we cannot recover your
            checklist or personal details if you lose your device or delete the
            app. You can permanently erase your account and data at any time
            via <span className="font-medium text-slate-900">Profile &rarr; Delete My Data</span>.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              use the Service for any unlawful purpose or in violation of any
              applicable regulation;
            </li>
            <li>
              probe, scan, overload, or disrupt the Service or its
              infrastructure, or attempt to access data belonging to other
              users;
            </li>
            <li>
              abuse, overload, or deliberately misuse the support or waitlist
              features; or
            </li>
            <li>
              scrape, resell, or redistribute the Service&apos;s content or
              data other than for your own personal, non-commercial move.
            </li>
          </ul>
        </Section>

        <Section title="Support chat and AI">
          <p>
            In-app support lets you choose from fixed general questions and may
            generate replies using a third-party AI provider. There is no
            free-text user input. AI answers can be wrong or incomplete and are
            provided for general guidance only — verify anything important
            against official sources.
          </p>
        </Section>

        <Section title="Intellectual property">
          <p>
            The Service, including its design, text, graphics, and software, is
            owned by ReloGo and protected by applicable intellectual-property
            laws. We grant you a limited, non-exclusive, non-transferable,
            revocable licence to use the app for your personal,
            non-commercial use. Government forms and content linked from the
            Service belong to their respective governments.
          </p>
        </Section>

        <Section title="Disclaimer of warranties">
          <p>
            The Service is provided{" "}
            <span className="font-semibold text-slate-900">
              &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
            </span>{" "}
            without warranties of any kind, express or implied, including
            fitness for a particular purpose, accuracy, or non-infringement. We
            do not warrant that checklists are complete or correct for your
            personal circumstances, that deadlines shown are current, or that
            the Service will be uninterrupted or error-free.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, ReloGo and its operators
            will not be liable for any indirect, incidental, special,
            consequential, or punitive damages, or for any missed deadlines,
            fines, fees, lost documents, or other losses arising from your use
            of (or inability to use) the Service. Where liability cannot be
            excluded, our total aggregate liability is limited to CAD $50.
            Some jurisdictions do not allow certain exclusions, so parts of
            this section may not apply to you.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You can stop using the Service at any time; deleting your data in
            the app removes your account. We may suspend or terminate access
            that violates these Terms or harms the Service, and we may modify
            or discontinue the Service (in whole or in part) at any time.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these Terms from time to time. When we do, we&apos;ll
            revise the &ldquo;Last updated&rdquo; date above, and significant
            changes will be communicated within the app or on this page.
            Continuing to use the Service after changes take effect means you
            accept the revised Terms.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These Terms are governed by the laws of the Province of Ontario
            and the federal laws of Canada applicable therein, without regard
            to conflict-of-law rules. Courts located in Ontario have exclusive
            jurisdiction over any dispute arising from the Service, except
            where the law of your province of residence grants you
            non-waivable rights or venue.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about these Terms? Email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </article>

      <SiteFooter />
    </main>
  );
}
