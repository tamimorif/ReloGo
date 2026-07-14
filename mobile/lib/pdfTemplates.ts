import type { PIIKey, Province } from "@/types/database";

export type PDFFieldMapping = Readonly<{
  fieldName: string;
  piiKey: PIIKey;
  valueFormat?: "ISO_DATE_TO_MMDDYYYY";
}>;

export type PDFTemplate = Readonly<{
  taskKey: string;
  destination: Province;
  sourceUrl: string;
  sha256: string;
  outputSlug: string;
  maxBytes: number;
  fields: readonly PDFFieldMapping[];
}>;

const BC_HEALTH_CARD_TEMPLATE: PDFTemplate = {
  taskKey: "UPDATE_HEALTH_CARD",
  destination: "BC",
  // The blank form is downloaded only after an explicit tap. It is not
  // bundled with or redistributed by ReloGo, and no PII is sent in this
  // request. Filling happens locally after the download completes.
  sourceUrl:
    "https://www2.gov.bc.ca/assets/gov/health/forms/101fil.pdf",
  // Audited 2026-07-14: six official web-link actions and seven unique field
  // formatting/validation scripts only. A changed upstream file must be
  // reviewed and explicitly repinned before any on-device PII is read.
  sha256: "30de754d48f2e90e9c8b49b1d4339ddc54be3d5fc913aab1ac45738c3e719f81",
  outputSlug: "bc-health-coverage-form",
  maxBytes: 10 * 1024 * 1024,
  fields: [
    { fieldName: "sig_applicant_name", piiKey: "FULL_NAME" },
    {
      fieldName: "applicant_birthdate",
      piiKey: "DATE_OF_BIRTH",
      // The form's own Acrobat action specifies mmddyyyy and caps this field
      // at eight characters; the local profile stores DOB as YYYY-MM-DD.
      valueFormat: "ISO_DATE_TO_MMDDYYYY",
    },
    {
      fieldName: "applicant_residential_address",
      piiKey: "STREET_ADDRESS",
    },
    {
      fieldName: "applicant_previous_health_number",
      piiKey: "HEALTH_CARD_NUMBER",
    },
  ],
};

const PDF_TEMPLATES: readonly PDFTemplate[] = [BC_HEALTH_CARD_TEMPLATE];

/** Resolve a form by both task and destination so it cannot leak corridors. */
export function getPDFTemplate(
  taskKey: string,
  destination: Province | null | undefined,
): PDFTemplate | undefined {
  if (!destination) return undefined;
  return PDF_TEMPLATES.find(
    (template) =>
      template.taskKey === taskKey && template.destination === destination,
  );
}

export function hasPDFTemplate(
  taskKey: string,
  destination: Province | null | undefined,
): boolean {
  return getPDFTemplate(taskKey, destination) !== undefined;
}

/** Format a local vault value for the exact constraints of a mapped field. */
export function formatPDFFieldValue(
  mapping: PDFFieldMapping,
  value: string,
): string | undefined {
  if (mapping.valueFormat !== "ISO_DATE_TO_MMDDYYYY") return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }

  return `${month}${day}${year}`;
}
