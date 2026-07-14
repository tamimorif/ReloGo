import {
  formatPDFFieldValue,
  getPDFTemplate,
  hasPDFTemplate,
} from "../../lib/pdfTemplates";

describe("PDF template registry", () => {
  it("registers the official B.C. form only for the exact task and destination", () => {
    expect(hasPDFTemplate("UPDATE_HEALTH_CARD", "BC")).toBe(true);
    expect(hasPDFTemplate("UPDATE_HEALTH_CARD", "ON")).toBe(false);
    expect(hasPDFTemplate("UPDATE_DRIVERS_LICENCE", "BC")).toBe(false);
    expect(hasPDFTemplate("UPDATE_HEALTH_CARD", null)).toBe(false);
  });

  it("uses the official source and exact AcroForm field mappings", () => {
    const template = getPDFTemplate("UPDATE_HEALTH_CARD", "BC");

    expect(template).toBeDefined();
    expect(template?.sourceUrl).toBe(
      "https://www2.gov.bc.ca/assets/gov/health/forms/101fil.pdf",
    );
    expect(template?.sha256).toBe(
      "30de754d48f2e90e9c8b49b1d4339ddc54be3d5fc913aab1ac45738c3e719f81",
    );
    expect(template?.maxBytes).toBe(10 * 1024 * 1024);
    expect(template?.fields).toEqual([
      { fieldName: "sig_applicant_name", piiKey: "FULL_NAME" },
      {
        fieldName: "applicant_birthdate",
        piiKey: "DATE_OF_BIRTH",
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
    ]);
  });

  it("converts a valid local ISO birth date to the form's mmddyyyy format", () => {
    const mapping = getPDFTemplate("UPDATE_HEALTH_CARD", "BC")?.fields.find(
      ({ fieldName }) => fieldName === "applicant_birthdate",
    );

    expect(mapping).toBeDefined();
    expect(formatPDFFieldValue(mapping!, "1990-12-31")).toBe("12311990");
    expect(formatPDFFieldValue(mapping!, "1990-02-30")).toBeUndefined();
    expect(formatPDFFieldValue(mapping!, "12/31/1990")).toBeUndefined();
  });
});
