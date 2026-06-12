"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PROVINCES: { code: string; name: string }[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const selectClasses =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export default function WaitlistForm() {
  const [originProvince, setOriginProvince] = useState("");
  const [destProvince, setDestProvince] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corridorReady =
    originProvince !== "" &&
    destProvince !== "" &&
    originProvince !== destProvince;

  const sameProvince =
    originProvince !== "" &&
    destProvince !== "" &&
    originProvince === destProvince;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!corridorReady || submitting) return;

    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("join_waitlist", {
      p_email: email.trim(),
      p_origin_province: originProvince,
      p_dest_province: destProvince,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(
        "Something went wrong joining the waitlist. Please check your connection and try again."
      );
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="animate-scale-in rounded-2xl border border-brand-100 bg-brand-50 p-8 text-center shadow-sm">
        <CheckCircle2
          className="mx-auto h-12 w-12 text-brand-600"
          aria-hidden="true"
        />
        <h3 className="mt-4 text-xl font-semibold text-slate-900">
          You&apos;re on the list!
        </h3>
        <p className="mt-2 text-slate-600">
          We&apos;ll email you as soon as ReloGo is ready for your{" "}
          <span className="font-medium text-slate-900">
            {originProvince} &rarr; {destProvince}
          </span>{" "}
          move.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-left">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Moving from
          </span>
          <select
            value={originProvince}
            onChange={(e) => setOriginProvince(e.target.value)}
            className={selectClasses}
            aria-label="Moving from"
          >
            <option value="" disabled>
              Select a province
            </option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-left">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Moving to
          </span>
          <select
            value={destProvince}
            onChange={(e) => setDestProvince(e.target.value)}
            className={selectClasses}
            aria-label="Moving to"
          >
            <option value="" disabled>
              Select a province
            </option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sameProvince && (
        <p className="mt-3 animate-fade-in text-sm text-slate-500">
          Pick two different provinces to see your relocation checklist.
        </p>
      )}

      <div
        className={`grid transition-all duration-500 ease-out ${
          corridorReady
            ? "mt-5 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Mail
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="email"
                required={corridorReady}
                disabled={!corridorReady}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <button
              type="submit"
              disabled={!corridorReady || submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Joining&hellip;
                </>
              ) : (
                <>
                  Join the waitlist
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 animate-fade-in text-sm font-medium text-red-600"
            >
              {error}
            </p>
          )}

          <p className="mt-3 text-xs text-slate-500">
            No spam &mdash; just one email when your corridor goes live.
          </p>
        </div>
      </div>
    </form>
  );
}
