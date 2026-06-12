/**
 * PDF form-filler engine.
 *
 * Loads a bundled PDF template, fills it with locally-stored PII,
 * writes the result to the cache directory, and opens the share sheet.
 *
 * PII never leaves the device — the filled PDF is generated on-device
 * and shared only when the user explicitly chooses a destination.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Asset } from "expo-asset";
import { getPII } from "@/lib/secureStore";
import type { PIIKey } from "@/types/database";

/**
 * Map of known PDF form field names → PII keys.
 * Extend this as new government PDFs are on-boarded.
 */
const FIELD_TO_PII: Record<string, PIIKey> = {
  full_name: "FULL_NAME",
  date_of_birth: "DATE_OF_BIRTH",
  street_address: "STREET_ADDRESS",
  health_card_number: "HEALTH_CARD_NUMBER",
  drivers_licence_number: "DRIVERS_LICENCE_NUMBER",
};

/**
 * Mapping from task IDs to their bundled PDF asset indices.
 * In production these would be require()'d static assets.
 * Placeholder mapping — extend per-form as assets are added.
 */
const TASK_PDF_ASSETS: Record<string, number> = {
  // Example: "task-health-card-on": require("../assets/pdfs/on-health-card.pdf"),
};

/**
 * Fill a bundled PDF template with the user's local PII and
 * present the native share/print dialog.
 */
export async function fillAndSharePDF(taskId: string): Promise<void> {
  // 1. Resolve the PDF asset
  const assetModule = TASK_PDF_ASSETS[taskId];
  if (assetModule === undefined) {
    throw new Error(`No PDF template registered for task "${taskId}"`);
  }

  const [asset] = await Asset.loadAsync(assetModule);
  if (!asset.localUri) {
    throw new Error("Failed to download PDF asset to local filesystem");
  }

  // 2. Read raw bytes
  const pdfBase64 = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

  // 3. Load PDF document
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 4. Try to fill form fields first, fall back to text overlay
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  if (fields.length > 0) {
    // Fill named form fields
    for (const field of fields) {
      const fieldName = field.getName();
      const piiKey = FIELD_TO_PII[fieldName];
      if (piiKey) {
        const value = await getPII(piiKey);
        if (value) {
          const textField = form.getTextField(fieldName);
          textField.setText(value);
          textField.updateAppearances(font);
        }
      }
    }
    form.flatten();
  } else {
    // No form fields — overlay text on the first page
    const page = pdfDoc.getPages()[0];
    const textEntries: Array<{ label: string; piiKey: PIIKey; y: number }> = [
      { label: "Name", piiKey: "FULL_NAME", y: 700 },
      { label: "DOB", piiKey: "DATE_OF_BIRTH", y: 675 },
      { label: "Address", piiKey: "STREET_ADDRESS", y: 650 },
      { label: "Health Card", piiKey: "HEALTH_CARD_NUMBER", y: 625 },
      { label: "Driver's Licence", piiKey: "DRIVERS_LICENCE_NUMBER", y: 600 },
    ];

    for (const entry of textEntries) {
      const value = await getPII(entry.piiKey);
      if (value) {
        page.drawText(`${entry.label}: ${value}`, {
          x: 50,
          y: entry.y,
          size: 12,
          font,
        });
      }
    }
  }

  // 5. Save filled PDF to cache
  const filledBytes = await pdfDoc.save();
  const filledBase64 = btoa(
    String.fromCharCode(...new Uint8Array(filledBytes)),
  );
  const outputPath = `${FileSystem.cacheDirectory}relogo-filled-${taskId}-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outputPath, filledBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 6. Share / print
  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(outputPath, {
    mimeType: "application/pdf",
    dialogTitle: "Share filled form",
    UTI: "com.adobe.pdf",
  });
}
