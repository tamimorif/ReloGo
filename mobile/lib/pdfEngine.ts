/**
 * PDF form-filler engine.
 *
 * Downloads an official blank PDF after an explicit user action, fills it
 * with locally-stored PII, writes the result to the cache directory, and
 * opens the share sheet.
 *
 * PII never leaves the device — the filled PDF is generated on-device
 * and shared only when the user explicitly chooses a destination.
 */
import { AppState, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import {
  PDFBool,
  PDFDocument,
  PDFName,
  StandardFonts,
  type PDFFont,
} from "pdf-lib";
// The classic FileSystem API moved to the /legacy entry point in newer SDKs.
// This module's cache-hygiene guarantees were reviewed against the classic
// semantics — prefer the explicit legacy import over a rewrite to the new
// File/Paths API until that migration gets its own review.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getPII } from "@/lib/secureStore";
import {
  ANDROID_SHARE_GRACE_MS,
  cacheSubdirectory,
  scheduleAndroidSharedFileCleanup,
  sweepTemporaryPDFs,
  wipeFilledPDFs,
} from "@/lib/pdfCleanup";
import {
  formatPDFFieldValue,
  getPDFTemplate,
} from "@/lib/pdfTemplates";
import type { Province } from "@/types/database";

export { hasPDFTemplate } from "@/lib/pdfTemplates";
export { sweepTemporaryPDFs, wipeFilledPDFs } from "@/lib/pdfCleanup";

const PDF_HEADER_BYTES = 5;

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function hasPDFHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_HEADER_BYTES &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function arrayBufferToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canEncodeAppearance(font: PDFFont, value: string): boolean {
  try {
    font.encodeText(value);
    return true;
  } catch {
    // StandardFonts.Helvetica is WinAnsi-only. The field value itself is a
    // Unicode PDF string, so keep it and ask the receiving viewer to generate
    // the appearance instead of crashing or corrupting the value.
    return false;
  }
}

/**
 * Download and fill the destination-specific official form with local PII,
 * then present the native share/print dialog. The blank download contains no
 * user data; all mapped values are read only after local validation succeeds.
 */
export async function fillAndSharePDF(
  taskKey: string,
  destination: Province,
): Promise<void> {
  // 0. Sweep leftovers from previous shares. We deliberately do NOT delete
  // right after shareAsync resolves: on Android, share targets (Gmail,
  // Drive, …) read the file in a background worker AFTER the chooser
  // returns, so an immediate wipe breaks the attachment. A resolved chooser
  // schedules exact-file cleanup below; this age-aware sweep and app start
  // restore the remaining grace if the process was suspended or restarted.
  // Account deletion and sign-out remain unconditional wipes.
  await sweepTemporaryPDFs();

  // 1. Resolve the task + destination template. A task-only lookup would show
  // a provincial form to users moving elsewhere.
  const template = getPDFTemplate(taskKey, destination);
  if (!template) {
    throw new Error("No form is available for this task and destination");
  }

  const blankDirectory = cacheSubdirectory("blank-pdf-templates");
  const blankPath = `${blankDirectory}${template.outputSlug}-${Crypto.randomUUID()}-${Date.now()}.pdf`;
  let pdfBytes: Uint8Array;

  try {
    await FileSystem.makeDirectoryAsync(blankDirectory, {
      intermediates: true,
    });
    let sizeLimitExceeded = false;
    let interruptedByAppState = false;
    let downloadStarted = false;
    let cancellation: Promise<void> | undefined;
    let downloadTask: FileSystem.DownloadResumable | undefined;

    const cancelDownload = (): void => {
      if (cancellation || !downloadTask || !downloadStarted) return;
      cancellation = downloadTask.cancelAsync().catch(() => undefined);
    };

    downloadTask = FileSystem.createDownloadResumable(
      template.sourceUrl,
      blankPath,
      {
        cache: false,
        sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
        headers: {
          // A compliant server returns at most maxBytes + 1 bytes. The final
          // byte is an oversize sentinel; progress cancellation below also
          // protects when a server ignores Range or omits Content-Length.
          Range: `bytes=0-${template.maxBytes}`,
          "Accept-Encoding": "identity",
        },
      },
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const declaredSizeExceedsLimit =
          totalBytesExpectedToWrite > template.maxBytes;
        if (
          sizeLimitExceeded ||
          (!declaredSizeExceedsLimit &&
            totalBytesWritten <= template.maxBytes)
        ) {
          return;
        }

        sizeLimitExceeded = true;
        // The progress callback cannot be async. Retain and await the native
        // cancellation promise below before deleting the partial file.
        cancelDownload();
      },
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active" || interruptedByAppState) return;
        interruptedByAppState = true;
        // Android ignores FileSystemSessionType.FOREGROUND and pauses progress
        // callbacks while backgrounded, so explicitly stop the native task.
        cancelDownload();
      },
    );
    let download: FileSystem.FileSystemDownloadResult | undefined;
    try {
      // Close the add-listener/check race: if the transition happened during
      // earlier filesystem work, do not start an Android background download.
      if (AppState.currentState !== "active") {
        interruptedByAppState = true;
      } else if (!interruptedByAppState) {
        downloadStarted = true;
        download = await downloadTask.downloadAsync();
      }
    } catch (error) {
      if (!sizeLimitExceeded && !interruptedByAppState) throw error;
    } finally {
      downloadStarted = false;
      appStateSubscription.remove();
    }
    await cancellation;

    if (sizeLimitExceeded) {
      throw new Error("The official form download was invalid or too large");
    }

    if (interruptedByAppState) {
      throw new Error(
        "The official form download was interrupted; keep ReloGo open and try again",
      );
    }

    if (!download) {
      throw new Error("The official form could not be downloaded");
    }

    if (download.status < 200 || download.status >= 300) {
      throw new Error("The official form could not be downloaded");
    }

    const info = await FileSystem.getInfoAsync(blankPath);
    if (
      !info.exists ||
      info.isDirectory ||
      info.size <= 0 ||
      info.size > template.maxBytes
    ) {
      throw new Error("The official form download was invalid or too large");
    }

    const headerBase64 = await FileSystem.readAsStringAsync(blankPath, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: PDF_HEADER_BYTES,
    });
    if (!hasPDFHeader(decodeBase64(headerBase64))) {
      throw new Error("The official form download was not a valid PDF");
    }

    const pdfBase64 = await FileSystem.readAsStringAsync(blankPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    pdfBytes = decodeBase64(pdfBase64);

    // Copy into a plain ArrayBuffer-backed view. TypeScript's generic
    // Uint8Array otherwise permits SharedArrayBuffer, which the native crypto
    // bridge intentionally does not accept.
    const digestInput = new Uint8Array(pdfBytes.length);
    digestInput.set(pdfBytes);
    const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      digestInput,
    );
    if (arrayBufferToHex(digest) !== template.sha256) {
      throw new Error(
        "The official form has changed and must be reviewed before filling",
      );
    }
  } finally {
    // The official blank is temporary and contains no PII. Delete it on every
    // success and failure path so it is never treated as an app asset/cache.
    try {
      await FileSystem.deleteAsync(blankPath, { idempotent: true });
    } catch {
      // Cache eviction is also enforced by the OS; never mask the real error.
    }
  }

  // 2. Load the validated PDF document.
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 3. Validate every configured AcroForm field before reading any PII. If the
  // government replaces the PDF or changes field names, fail closed instead
  // of generating a misleading partially mapped document.
  const form = pdfDoc.getForm();
  const mappedFields = template.fields.map((mapping) => {
    try {
      return { field: form.getTextField(mapping.fieldName), mapping };
    } catch {
      throw new Error(
        "The official form has changed and cannot be filled safely",
      );
    }
  });

  // 4. Fill only mapped text fields from the encrypted on-device vault.
  let needsViewerAppearance = false;
  for (const { field, mapping } of mappedFields) {
    const storedValue = await getPII(mapping.piiKey);
    const value = storedValue
      ? formatPDFFieldValue(mapping, storedValue)
      : undefined;
    if (value) {
      field.setText(value);
      if (canEncodeAppearance(font, value)) {
        field.updateAppearances(font);
      } else {
        needsViewerAppearance = true;
      }
    }
  }
  if (needsViewerAppearance) {
    // Preserve Unicode field values and keep the form editable. PDF viewers
    // can use their Unicode-capable system fallback when regenerating the
    // appearance; the user is warned to review every field before sharing.
    form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  }
  // Do not flatten: users must be able to review and complete all remaining
  // government fields in a compatible PDF app before submitting the form.

  // 5. Save filled PDF to cache.
  // Base64-encode in chunks — spreading the whole array into
  // String.fromCharCode overflows the call stack on large PDFs.
  // Every populated WinAnsi field was updated above. Disabling pdf-lib's
  // automatic pass prevents it from retrying Unicode values with Helvetica.
  const filledBytes = new Uint8Array(
    await pdfDoc.save({ updateFieldAppearances: false }),
  );
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < filledBytes.length; i += CHUNK) {
    binary += String.fromCharCode(...filledBytes.subarray(i, i + CHUNK));
  }
  const filledBase64 = btoa(binary);

  const filledPDFDirectory = cacheSubdirectory("filled-pdfs");
  const outputPath = `${filledPDFDirectory}${template.outputSlug}-${Crypto.randomUUID()}-${Date.now()}.pdf`;
  let shareSheetReturned = false;
  try {
    await FileSystem.makeDirectoryAsync(filledPDFDirectory, {
      intermediates: true,
    });
    await FileSystem.writeAsStringAsync(outputPath, filledBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 6. Share / print. On iOS the share sheet completes synchronously with
    // the copy, so we can clean up immediately. Expo cannot distinguish an
    // Android chooser cancellation from a completed share; either way, give
    // any async receiver ten minutes and then delete this exact cache file.
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      throw new Error("Sharing is not available on this device");
    }
    await Sharing.shareAsync(outputPath, {
      mimeType: "application/pdf",
      dialogTitle: "Review and complete the B.C. health form",
      UTI: "com.adobe.pdf",
    });
    shareSheetReturned = true;
    if (Platform.OS === "android") {
      const expiresAt = Date.now() + ANDROID_SHARE_GRACE_MS;
      const markerPath = `${outputPath}.${expiresAt}.expiry`;
      const cleanup = { expiresAt, markerPath };
      scheduleAndroidSharedFileCleanup(outputPath, cleanup);
      try {
        // The marker contains no PII; its filename persists the share-return
        // expiry so a restart cannot shorten a receiver's remaining grace.
        await FileSystem.writeAsStringAsync(markerPath, "");
      } catch {
        // The in-memory timer still applies. A later routine sweep falls back
        // to the PDF timestamp if the marker could not be persisted.
      }
    }
  } finally {
    // A failed write/share cannot have an Android consumer still reading the
    // attachment, so remove any partial or complete PII-bearing file now.
    // A resolved Android chooser gets the scheduled grace period above.
    if (!shareSheetReturned || Platform.OS === "ios") {
      await wipeFilledPDFs();
    }
  }
}
