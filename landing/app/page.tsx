import {
  ClipboardCheck,
  FileText,
  Lock,
  MapPin,
  Truck,
} from "lucide-react";
import WaitlistForm from "@/components/WaitlistForm";

const steps = [
  {
    icon: MapPin,
    title: "Tell us your corridor",
    description:
      "Pick where you're moving from and where you're headed. Every province pair has its own rules - we know them all.",
  },
  {
    icon: ClipboardCheck,
    title: "Get your personalized checklist",
    description:
      "Driver's licence, health card, vehicle registration, CRA address - every deadline laid out, ordered, and tracked for you.",
  },
  {
    icon: FileText,
    title: "Auto-fill the paperwork",
    description:
      "ReloGo pre-fills the forms each agency needs so a 40-minute application becomes a 4-minute review.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-hero-gradient">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Truck className="h-7 w-7 text-brand-600" aria-hidden="true" />
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Relo<span className="text-brand-600">Go</span>
          </span>
        </div>
        <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          Coming soon
        </span>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-12 text-center sm:pt-20">
        <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
          Move provinces without the{" "}
          <span className="text-brand-600">paperwork panic</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl animate-fade-in-up text-lg leading-relaxed text-slate-600 sm:text-xl">
          ReloGo turns your interprovincial move into one clear checklist -
          licences, health cards, registrations, and deadlines, all handled in
          the right order so nothing falls through the cracks.
        </p>

        <div className="mx-auto mt-12 max-w-xl animate-fade-in-up rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-brand-100/50 backdrop-blur sm:p-8">
          <WaitlistForm />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">
            Three steps from &ldquo;we&apos;re moving&rdquo; to &ldquo;we&apos;re
            done&rdquo;.
          </p>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100">
                  <step.icon
                    className="h-7 w-7 text-brand-600"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-600">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy blurb */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 text-center sm:flex-row sm:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <Lock className="h-7 w-7 text-brand-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Your personal information stays on your device
            </h2>
            <p className="mt-2 leading-relaxed text-slate-600">
              Sensitive details like your licence and health card numbers are
              stored only in your phone&apos;s secure storage - never on our
              servers. Privacy isn&apos;t a feature, it&apos;s the foundation.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <p className="text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} ReloGo &middot; Made for movers
          across Canada
        </p>
      </footer>
    </main>
  );
}
