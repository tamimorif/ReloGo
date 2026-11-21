import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Smartphone, Server } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import { CURRENT_POLICY_VERSION } from "@/lib/legal";
import { SUPPORT_EMAIL } from "@/lib/support";

const LAST_UPDATED = "November 16, 2026";
const PRIVACY_TITLE = "Privacy Policy - ReloGo";
const PRIVACY_DESCRIPTION =
  "ReloGo keeps move details and checklist progress on your device. Human support conversations are stored so the support team can reply.";

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
    siteName: "ReloGo",
    url: "/privacy",
    type: "website",
    locale: "en_CA",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
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

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Version {CURRENT_POLICY_VERSION} · Last updated: {LAST_UPDATED}
        </p>

        {/* Highlight */}
        <div className="mt-8 flex gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
          <ShieldCheck
            className="h-7 w-7 shrink-0 text-brand-600"
            aria-hidden="true"
          />
          <p className="leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">
              The short version:
            </span>{" "}
            Your city-level route, optional vehicle and school-age children
            answers, and checklist checkmarks stay on your device.
            The app sends province codes to
            fetch general task guidance. If you contact support, your selected
            question and the human replies are stored on our server and cached
            on your phone.
          </p>
        </div>

        <Section title="Who we are">
          <p>
            ReloGo (&ldquo;ReloGo,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) is a mobile application that helps people moving
            between Canadian provinces or territories build a personalized
            checklist of government tasks - licence exchanges, health card
            updates, vehicle registration, address changes, and more. This
            policy explains what information ReloGo handles and how. It is
            written to align with Canada&apos;s Personal Information Protection and
            Electronic Documents Act (PIPEDA).
          </p>
        </Section>

        <Section title="Information stored on your device">
          <div className="flex items-start gap-3">
            <Smartphone
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              The app saves your origin and destination city and province and
              optional vehicle and school-age children answers and checklist
              checkmarks in the app&apos;s local storage. These details are used to
              build and display your checklist on this device.
            </p>
          </div>
          <p>
            Your city and checkmarks are not written to
            ReloGo&apos;s application database. Province codes are sent when the app
            requests general corridor rules; cities, optional answers, and
            checkmarks are not included in that request. Use{" "}
            <span className="font-medium text-slate-900">
              Move &rarr; Clear this device&apos;s checklist
            </span>{" "}
            to remove the locally saved route and progress. Removing the app can
            also make this information unavailable.
          </p>
        </Section>

        <Section title="Official links and task guidance">
          <p>
            The app sends origin and destination province codes to Supabase to
            retrieve general task rules and official links. Those codes are not
            saved as a user profile by the current mobile app. Opening a link
            takes you to a government website, which may receive ordinary
            connection information under that website&apos;s own privacy practices.
          </p>
        </Section>

        <Section title="Information we store on our servers">
          <div className="flex items-start gap-3">
            <Server
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              The app stores only support conversations in its hosted database
              (Supabase). It creates a random anonymous support identifier when
              you first open Help so the conversation can be associated with
              your device:
            </p>
          </div>
          <ul className="ml-5 list-disc space-y-1">
            <li>An anonymous account identifier (not linked to your name or email)</li>
            <li>
              The fixed question you select, support-team replies, and
              conversation status
            </li>
          </ul>
          <p>
            The support identifier is not linked to your name, email, home
            address, or government document numbers. The current app does not
            create a login or ask for personal details. The support transcript
            remains on the server so an administrator can reply and is also
            cached on the device. The website waitlist is separate and stores
            the email and jurisdictions you provide there.
          </p>
        </Section>

        <Section title="How we use information">
          <p>
            We use support messages to route your selected question to a human
            and show the team&apos;s reply. The public rules service uses the two
            province codes in your request to return general checklist
            guidance. The website waitlist uses its separate information to
            contact people about availability. We do{" "}
            <span className="font-semibold text-slate-900">not</span> sell your
            data, we do{" "}
            <span className="font-semibold text-slate-900">not</span> show
            advertising, and we do{" "}
            <span className="font-semibold text-slate-900">not</span> use
            third-party advertising or tracking technologies.
          </p>
        </Section>

        <Section title="Anonymous support identifier">
          <p>
            The checklist does not require an account. The app creates an
            anonymous support identity only when you open Help; no name, email,
            or password is requested. If you remove the app, the local support
            cache and its sign-in credential may be lost, so a later install may
            not be able to recover that conversation.
          </p>
        </Section>

        <Section title="Deleting checklist and support information">
          <p>
            The Move tab&apos;s clear action deletes the route and checkmarks stored
            on this device. It does not delete support conversations from our
            server. The current app does not have a self-service chat deletion
            control; use the published support contact to request help with a
            server-stored conversation.
          </p>
          <p>
            {SUPPORT_EMAIL ? (
              <>
                To be removed from the website waitlist, email us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                from the address you used, and we&apos;ll delete your entry.
              </>
            ) : (
              <>
                The public waitlist-removal channel is not yet configured. The
                waitlist remains a preview feature and must not launch until a
                monitored channel is published on the{" "}
                <Link
                  href="/support"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Support page
                </Link>
                .
              </>
            )}
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            Supabase hosts the public rule resolver and human-support
            conversations. The current mobile app does not send support
            questions to an AI provider. Expo, Apple, and Google provide app
            build and distribution services. Each provider has its own terms
            and privacy practices.
          </p>
        </Section>

        <Section title="In-app human support">
          <p>
            You choose from six pre-written general questions; there is no
            free-text support box. The selected question is stored in a support
            thread that a human team member can read and answer. The app caches
            the thread on your device so it remains available when you reopen
            the app. The current mobile app does not use Gemini or another AI
            provider to answer support questions.
          </p>
          <p>
            Support chats are retained on the server and are visible to
            authorized support administrators. The current app has no user
            message composer; do not include sensitive information in any
            support reply from staff.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Support sessions are stored locally using encrypted session
            storage. Data exchanged with Supabase uses HTTPS, and row-level
            security restricts a support user to their own threads. Checklist
            details remain in app-local storage and are not included in support
            requests.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            ReloGo is intended for adults managing a move. It is not directed at
            children, and we do not knowingly collect personal information from
            children. Information about dependents is limited to a single yes/no
            flag indicating whether child-related tasks should be added to your
            checklist.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we&apos;ll
            revise the version and &ldquo;Last updated&rdquo; date above. When a
            new version requires your agreement, the app will ask you to review
            and affirmatively accept it before continuing.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            {SUPPORT_EMAIL ? (
              <>
                Questions about this policy or your privacy? Email us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </>
            ) : (
              <>
                The monitored privacy contact is not yet configured for this
                preview. Current contact options and launch status appear on
                the{" "}
                <Link
                  href="/support"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  Support page
                </Link>
                .
              </>
            )}
          </p>
        </Section>
      </article>

      <SiteFooter />
    </main>
  );
}
