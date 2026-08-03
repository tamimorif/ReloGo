/**
 * Lightweight cache hygiene for locally generated PDFs.
 *
 * Keep this module free of pdf-lib, crypto, secure storage, and sharing. It is
 * imported during app startup, so pulling the form-filling engine in here
 * would make every launch pay the cost of PDF generation before a user asks
 * for it.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

export function cacheSubdirectory(name: string): string {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Device cache is unavailable");
  }
  return `${FileSystem.cacheDirectory}${name}/`;
}

export const ANDROID_SHARE_GRACE_MS = 10 * 60 * 1000;
const ANDROID_CLEANUP_RETRY_MS = 60 * 1000;

type ScheduledShareCleanup = Readonly<{
  expiresAt: number;
  markerPath?: string;
}>;

type ActiveShareCleanup = ScheduledShareCleanup &
  Readonly<{ timer: ReturnType<typeof setTimeout> }>;

// Prevent a second fill in the same process from shortening the grace. A tiny
// non-PII marker file restores the share-return expiry after an app restart.
const activeShareCleanups = new Map<string, ActiveShareCleanup>();

function detachTimer(timer: ReturnType<typeof setTimeout>): void {
  // Node exposes unref() during unit tests. React Native timers are numbers,
  // so this branch is ignored on-device while preventing a test-only timer
  // from keeping the Jest process alive.
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}

async function runScheduledShareCleanup(path: string): Promise<void> {
  const cleanup = activeShareCleanups.get(path);
  if (!cleanup) return;

  try {
    // Never remove the recovery marker/state unless the PII-bearing file is
    // gone. A transient native filesystem failure gets a one-minute retry.
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    if (activeShareCleanups.get(path) !== cleanup) return;
    const retryTimer = setTimeout(() => {
      void runScheduledShareCleanup(path);
    }, ANDROID_CLEANUP_RETRY_MS);
    activeShareCleanups.set(path, { ...cleanup, timer: retryTimer });
    detachTimer(retryTimer);
    return;
  }

  if (cleanup.markerPath) {
    await FileSystem.deleteAsync(cleanup.markerPath, {
      idempotent: true,
    }).catch(() => undefined);
  }
  if (activeShareCleanups.get(path) === cleanup) {
    activeShareCleanups.delete(path);
  }
}

export function scheduleAndroidSharedFileCleanup(
  path: string,
  cleanup: ScheduledShareCleanup,
): void {
  // A live in-process timer is monotonic relative to its original delay. Do
  // not duplicate it or shorten the receiver grace because wall time changed.
  if (activeShareCleanups.has(path)) return;

  const timer = setTimeout(() => {
    void runScheduledShareCleanup(path);
  }, Math.max(0, cleanup.expiresAt - Date.now()));
  activeShareCleanups.set(path, { ...cleanup, timer });
  detachTimer(timer);
}

function cachedPDFCreatedAt(fileName: string): number | undefined {
  const match = /-(\d+)\.pdf$/.exec(fileName);
  if (!match) return undefined;

  const createdAt = Number(match[1]);
  return Number.isSafeInteger(createdAt) && createdAt > 0
    ? createdAt
    : undefined;
}

/**
 * Delete every filled PDF and interrupted blank download from the cache.
 * Account deletion/sign-out use this unconditional cleanup path.
 */
export async function wipeFilledPDFs(): Promise<void> {
  await Promise.all([
    FileSystem.deleteAsync(cacheSubdirectory("filled-pdfs"), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(cacheSubdirectory("blank-pdf-templates"), {
      idempotent: true,
    }),
  ]);
  for (const cleanup of activeShareCleanups.values()) {
    clearTimeout(cleanup.timer);
  }
  activeShareCleanups.clear();
}

/**
 * Recover temporary files without breaking an Android receiver that may still
 * be reading a recently shared attachment. Unknown/expired files are deleted;
 * younger files are rescheduled for only their remaining grace period.
 */
export async function sweepTemporaryPDFs(): Promise<void> {
  if (Platform.OS !== "android") {
    await wipeFilledPDFs();
    return;
  }

  const blankDirectory = cacheSubdirectory("blank-pdf-templates");
  const filledDirectory = cacheSubdirectory("filled-pdfs");
  await FileSystem.deleteAsync(blankDirectory, { idempotent: true });
  await FileSystem.makeDirectoryAsync(filledDirectory, {
    intermediates: true,
  });

  const fileNames = await FileSystem.readDirectoryAsync(filledDirectory);
  const now = Date.now();
  const existingPDFPaths = new Set(
    fileNames
      .filter((fileName) => fileName.endsWith(".pdf"))
      .map((fileName) => `${filledDirectory}${fileName}`),
  );
  for (const path of activeShareCleanups.keys()) {
    if (!existingPDFPaths.has(path)) {
      const cleanup = activeShareCleanups.get(path);
      if (cleanup) clearTimeout(cleanup.timer);
      activeShareCleanups.delete(path);
    }
  }

  const markerByPDFName = new Map<
    string,
    { expiresAt: number; markerPath: string }
  >();
  const orphanMarkerPaths: string[] = [];
  for (const fileName of fileNames) {
    const match = /^(.*\.pdf)\.(\d+)\.expiry$/.exec(fileName);
    if (!match) continue;

    const [, pdfName, expiryText] = match;
    const expiresAt = Number(expiryText);
    const markerPath = `${filledDirectory}${fileName}`;
    if (
      !existingPDFPaths.has(`${filledDirectory}${pdfName}`) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= 0
    ) {
      orphanMarkerPaths.push(markerPath);
      continue;
    }
    const existingMarker = markerByPDFName.get(pdfName);
    if (!existingMarker || expiresAt < existingMarker.expiresAt) {
      if (existingMarker) orphanMarkerPaths.push(existingMarker.markerPath);
      markerByPDFName.set(pdfName, { expiresAt, markerPath });
    } else {
      orphanMarkerPaths.push(markerPath);
    }
  }

  await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".pdf"))
      .map(async (fileName) => {
        const path = `${filledDirectory}${fileName}`;
        const activeCleanup = activeShareCleanups.get(path);
        if (activeCleanup) return;

        const persistedCleanup = markerByPDFName.get(fileName);
        const createdAt = cachedPDFCreatedAt(fileName);
        const fallbackExpiry =
          createdAt === undefined
            ? undefined
            : createdAt + ANDROID_SHARE_GRACE_MS;
        const cleanup =
          persistedCleanup ??
          (fallbackExpiry === undefined
            ? undefined
            : { expiresAt: fallbackExpiry });

        if (!cleanup || cleanup.expiresAt <= now) {
          await FileSystem.deleteAsync(path, { idempotent: true });
          if (persistedCleanup) {
            await FileSystem.deleteAsync(persistedCleanup.markerPath, {
              idempotent: true,
            }).catch(() => undefined);
          }
          activeShareCleanups.delete(path);
          return;
        }

        // A corrupt marker or backwards clock change cannot grant more than
        // one fresh grace. Persist the clamped value so repeated restarts do
        // not renew that grace indefinitely.
        const effectiveExpiry = Math.min(
          cleanup.expiresAt,
          now + ANDROID_SHARE_GRACE_MS,
        );
        let markerPath = persistedCleanup?.markerPath;
        if (
          !persistedCleanup ||
          persistedCleanup.expiresAt !== effectiveExpiry
        ) {
          const replacementMarkerPath = `${path}.${effectiveExpiry}.expiry`;
          await FileSystem.writeAsStringAsync(replacementMarkerPath, "");
          if (markerPath && markerPath !== replacementMarkerPath) {
            await FileSystem.deleteAsync(markerPath, {
              idempotent: true,
            }).catch(() => undefined);
          }
          markerPath = replacementMarkerPath;
        }

        scheduleAndroidSharedFileCleanup(path, {
          expiresAt: effectiveExpiry,
          markerPath,
        });
      }),
  );
  await Promise.allSettled(
    orphanMarkerPaths.map((path) =>
      FileSystem.deleteAsync(path, { idempotent: true }),
    ),
  );
}
