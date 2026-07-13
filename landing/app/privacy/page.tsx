import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Smartphone, Server, Trash2 } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

// Update this to a monitored address before publishing the store listings.
const CONTACT_EMAIL = "privacy@relogo.app";
const LAST_UPDATED = "July 13, 2026";

export const metadata: Metadata = {
  title: "Privacy Policy - ReloGo",
  description:
    "How ReloGo handles your data. Your sensitive personal information stays on your device and is never sent to our servers.",
  alternates: {
    canonical: "/privacy",
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
        <p className="mt-3 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

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
            Your most sensitive details - your name, address, date of birth,
            driver&apos;s licence number, and health card number - are stored only
            on your device. They are never transmitted to ReloGo or stored on
            our servers. A filled form leaves the app only when you explicitly
            choose where to share or save it. Privacy isn&apos;t a feature of
            ReloGo; it&apos;s how the app is built.
          </p>
        </div>

        <Section title="Who we are">
          <p>
            ReloGo (&ldquo;ReloGo,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) is a mobile application that helps people moving
            between Canadian provinces build a personalized checklist of
            government tasks - licence exchanges, health card updates, vehicle
            registration, address changes, and more. This policy explains what
            information ReloGo handles and how. It is written to align with
            Canada&apos;s Personal Information Protection and Electronic Documents
            Act (PIPEDA).
          </p>
        </Section>

        <Section title="Information stored only on your device">
          <div className="flex items-start gap-3">
            <Smartphone
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              ReloGo&apos;s on-device form feature can use personal details you
              choose to save on your phone when a compatible PDF template is
              available. These can include your full name, date of birth, street
              address, driver&apos;s licence number, and provincial health card
              number. The current preview does not include a production
              government template.
            </p>
          </div>
          <p>
            This information is stored exclusively in your device&apos;s secure
            storage (the operating system&apos;s protected storage - Keychain on
            iOS, Keystore on Android). It is read locally only when you use a
            compatible form, and it is{" "}
            <span className="font-semibold text-slate-900">
              never sent to ReloGo&apos;s servers or logs and never sent to a third
              party automatically.
            </span>{" "}
            We have no server-side place to store it and therefore cannot access,
            view, or recover it.
          </p>
          <p>
            When a compatible template is available, filled PDF forms are
            generated on your device in a dedicated temporary cache. On iOS,
            ReloGo removes its cached copy after the share action completes. On
            Android, a receiving app may continue reading the attachment after
            the chooser closes, so ReloGo removes cached copies at the next app
            start or form fill, and always when you sign out or delete your
            account. A copy you choose to save or send is controlled by the
            destination you selected.
          </p>
        </Section>

        <Section title="Information we store on our servers">
          <div className="flex items-start gap-3">
            <Server
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              So your checklist and support work across sessions, we store a
              limited amount of account and move information in our hosted
              database (Supabase):
            </p>
          </div>
          <ul className="ml-5 list-disc space-y-1">
            <li>An anonymous account identifier (not linked to your name or email)</li>
            <li>Your origin and destination provinces</li>
            <li>Your planned move date</li>
            <li>
              Whether you indicated you&apos;re bringing a vehicle or moving with
              children
            </li>
            <li>Which checklist tasks you&apos;ve marked complete</li>
            <li>
              Your selected fixed support questions, support replies, and
              conversation status
            </li>
          </ul>
          <p>
            This information distinguishes your anonymous account but does not
            include your name, address, personal document numbers, or account
            email. If you join our website waitlist, we separately store the
            email address and provinces you provide. For abuse prevention, the
            signup service also keeps an hourly counter keyed by a one-way hash
            derived from the requesting IP address; it does not store the raw
            address in the waitlist throttle table. Expired counters are pruned
            during later signup activity.
          </p>
        </Section>

        <Section title="How we use information">
          <p>
            We use the limited server-side data above only to generate and track
            your relocation checklist, answer the fixed support questions,
            operate human support, prevent signup abuse, and, for waitlist
            sign-ups, contact you about availability. We do{" "}
            <span className="font-semibold text-slate-900">not</span> sell your
            data, we do{" "}
            <span className="font-semibold text-slate-900">not</span> show
            advertising, and we do{" "}
            <span className="font-semibold text-slate-900">not</span> use
            third-party advertising or tracking technologies.
          </p>
        </Section>

        <Section title="Anonymous accounts">
          <p>
            ReloGo creates an anonymous account for you automatically - there is
            no sign-up, email, or password required to use the app. Because your
            account is anonymous and your sensitive information lives only on your
            device, uninstalling the app or losing your device means that data
            cannot be recovered.
          </p>
        </Section>

        <Section title="Deleting your data">
          <div className="flex items-start gap-3">
            <Trash2
              className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <p>
              You are always in control. In the app, go to{" "}
              <span className="font-medium text-slate-900">
                Profile &rarr; Delete My Data
              </span>{" "}
              to permanently erase your server-side account and all associated
              checklist data, along with any personal details and filled forms
              stored on your device.
            </p>
          </div>
          <p>
            To be removed from the website waitlist, email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we&apos;ll delete your entry.
          </p>
        </Section>

        <Section title="Service providers">
          <p>
            We use Supabase to host our database and provide anonymous
            authentication, Google Gemini to answer selected fixed support
            questions, and Expo, the Apple App Store, and Google Play to build or
            distribute the app. These providers process the relevant service
            data on our behalf under their own terms. Your on-device personal
            details are never sent to them by ReloGo.
          </p>
        </Section>

        <Section title="In-app support chat and AI">
          <p>
            ReloGo includes in-app help for general how-to and process
            questions. You choose from six pre-written questions; there is no
            free-text support box. A third-party AI provider (Google Gemini)
            processes the selected question together with non-identifying move
            context, such as your province corridor and applicable task titles,
            to produce a response.
          </p>
          <p>
            The fixed questions cannot include your name, address, date of
            birth, driver&apos;s licence number, health card number, or other
            personal text. Your on-device personal information is never read or
            sent by the support feature.
          </p>
          <p>
            If your question needs a person, a human support agent can take over
            the conversation. Once a human takes over a chat, it is{" "}
            <span className="font-semibold text-slate-900">
              no longer processed by the AI
            </span>
            .
          </p>
        </Section>

        <Section title="Security">
          <p>
            Sensitive personal information uses your operating system&apos;s
            protected storage. Data exchanged with our servers is transmitted
            over encrypted connections (HTTPS), and row-level security restricts
            an app user to their own records.
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
            revise the &ldquo;Last updated&rdquo; date above. Significant changes
            will be communicated within the app or on this page.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your privacy? Email us at{" "}
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
