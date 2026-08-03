# ReloGo App Store Metadata

> **Draft only (2026-08-03):** App Store version 1.0 has been live since
> 2026-06-23 (Apple ID `6781947478`, bundle ID `com.relogo.app`) and still
> points to the deleted backend; 1.0.1 has not shipped. This repository text is
> not evidence that App Store Connect or Google Play forms were updated. Fresh
> iOS build 7 finished from exact merged commit `e75f449`; Android build 4 was
> started from that commit. Neither has been submitted, and build completion is
> not real-device evidence. Before the 1.0.1 recovery submission, the account
> owner and legal reviewer must
> confirm the binary's behavior, anonymous account-linked data, Gemini
> processing, device-only PII claims, screenshots, and monitored Support URL.
> Reconcile the age rating shown by Apple's surfaces and inspect territorial
> availability/trader status in App Store Connect without assuming why some
> European/UK storefronts are absent. Google Play does not publicly expose the
> package now, but that does not establish its publication history. The live
> App Store answer that says ReloGo collects no data must be corrected: the
> anonymous identifier and linked move, progress, and support records listed
> below are collected even though sensitive PDF details remain device-only.

## App Name (iOS and Android)
ReloGo — Canadian Move Guide

## Subtitle (iOS)
Canadian move checklist

## Short Description (Android)
A personal checklist for moving across Canada.

## Description
Moving across Canada? ReloGo organizes common government updates into a
personalized checklist for supported moves across Canada.

**Features:**
- **Personalized Checklist**: Get a custom task list based on your destination, vehicle, and dependents.
- **Suggested Timing**: See checklist timing calculated from your planned move date, then confirm current requirements with the linked authority.
- **Official Sources**: Open the government source attached to each task for current details.
- **Local PDF Assistance**: For compatible forms, including British Columbia's health-coverage application, ReloGo fills mapped fields on your device and leaves the form editable for your review.
- **On-device Sensitive Details**: Your name, date of birth, address, driver's licence, and health-card numbers remain in operating-system protected storage and are not sent to ReloGo's servers.
- **Anonymous Onboarding**: Start using the app immediately. No email required to build your personalized plan.

## Privacy Labels (Nutrition Labels)

Use conservative disclosures: the anonymous Supabase identifier still links
the following records to one app account, even though ReloGo does not know the
person's name or email.

**Data collected and linked to the anonymous app account:**
- **User ID**: randomly generated anonymous account identifier.
- **Other User Content / App Functionality**: origin and destination province or territory,
  planned move date, vehicle/dependent flags, and checklist progress.
- **Customer Support**: selected fixed support questions, replies, and thread
  status. The selected question and non-identifying move/task context may be
  processed by Google Gemini to generate a reply.

Purposes: app functionality and customer support. Data is encrypted in transit,
and the in-app **Delete My Data** action deletes the account and associated
server records.

**Not collected by the 1.0.1 recovery app:**
- Advertising data or advertising identifiers.
- Product interaction analytics.
- Crash logs, performance diagnostics, or a third-party monitoring identifier.

Update this section before the 1.0.1 recovery submission if a crash-monitoring
or analytics SDK is added.

**Processed only on the device, not collected by ReloGo:**
- Name
- Date of Birth
- Physical Address
- Health Card Number
- Driver's Licence Number
- Completed Government PDFs

These values are used only for compatible local PDF filling. A blank form is
downloaded from its official government source after an explicit tap; mapped
personal values are added only after the file reaches the device.

## Keywords (iOS)
canada,moving,relocation,checklist,provinces,territories,health card,driving

## Promotional Text
Keep common government updates, suggested timing, and official sources in one
clear move checklist for provinces and territories.

## Privacy Policy URL
https://relogo-two.vercel.app/privacy

## Support URL
https://relogo-two.vercel.app/support

## Marketing URL
https://relogo-two.vercel.app
