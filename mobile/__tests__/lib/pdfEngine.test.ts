import { AppState, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { PDFDocument } from "pdf-lib";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getPII } from "../../lib/secureStore";
import {
  fillAndSharePDF,
  sweepTemporaryPDFs,
} from "../../lib/pdfEngine";

jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn(), currentState: "active" },
  Platform: { OS: "android" },
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: jest.fn(),
  randomUUID: jest.fn(),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  FileSystemSessionType: { FOREGROUND: 1 },
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  readDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock("../../lib/secureStore", () => ({ getPII: jest.fn() }));
jest.mock("pdf-lib", () => ({
  PDFDocument: { load: jest.fn() },
  PDFBool: { True: true },
  PDFName: { of: jest.fn((value: string) => value) },
  StandardFonts: { Helvetica: "Helvetica" },
}));

const AUDITED_SHA256 =
  "30de754d48f2e90e9c8b49b1d4339ddc54be3d5fc913aab1ac45738c3e719f81";

function hexToArrayBuffer(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (byte) => Number.parseInt(byte, 16),
  );
  return bytes.buffer as ArrayBuffer;
}

const mockDigest = Crypto.digest as jest.Mock;
const mockRandomUUID = Crypto.randomUUID as jest.Mock;
const mockAddAppStateListener = AppState.addEventListener as jest.Mock;
const mockRemoveAppStateListener = jest.fn();
const mockDeleteAsync = FileSystem.deleteAsync as jest.Mock;
const mockMakeDirectoryAsync = FileSystem.makeDirectoryAsync as jest.Mock;
const mockCreateDownloadResumable =
  FileSystem.createDownloadResumable as jest.Mock;
const mockResumableDownloadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockReadDirectoryAsync = FileSystem.readDirectoryAsync as jest.Mock;
const mockGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const mockReadAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
const mockWriteAsStringAsync = FileSystem.writeAsStringAsync as jest.Mock;
const mockIsAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;
const mockGetPII = getPII as jest.Mock;
const mockPDFLoad = PDFDocument.load as jest.Mock;
const mockFontEncodeText = jest.fn();
const mockFieldSetText = jest.fn();
const mockFieldUpdateAppearances = jest.fn();
const mockAcroDictSet = jest.fn();
const mockPDFSave = jest.fn();

function filledCacheDeleteCount(): number {
  return mockDeleteAsync.mock.calls.filter(
    ([path]) => path === "file:///cache/filled-pdfs/",
  ).length;
}

function filledPDFWritePaths(): string[] {
  return mockWriteAsStringAsync.mock.calls
    .map(([path]) => path as string)
    .filter((path) => path.endsWith(".pdf"));
}

function expiryMarkerWritePaths(): string[] {
  return mockWriteAsStringAsync.mock.calls
    .map(([path]) => path as string)
    .filter((path) => path.endsWith(".expiry"));
}

describe("filled PDF cache cleanup", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = "android";
    (AppState as { currentState: string }).currentState = "active";

    mockDeleteAsync.mockResolvedValue(undefined);
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockReadDirectoryAsync.mockResolvedValue([]);
    mockRandomUUID.mockReturnValue("00000000-0000-4000-8000-000000000000");
    mockAddAppStateListener.mockReturnValue({
      remove: mockRemoveAppStateListener,
    });
    mockResumableDownloadAsync.mockResolvedValue({ status: 200 });
    mockCancelAsync.mockResolvedValue(undefined);
    mockCreateDownloadResumable.mockImplementation(
      (
        _url: string,
        _path: string,
        _options: unknown,
        progressCallback: (progress: {
          totalBytesWritten: number;
          totalBytesExpectedToWrite: number;
        }) => void,
      ) => ({
        downloadAsync: mockResumableDownloadAsync,
        cancelAsync: mockCancelAsync,
        progressCallback,
      }),
    );
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 100,
    });
    mockReadAsStringAsync.mockImplementation(
      (_path: string, options?: { length?: number }) =>
        Promise.resolve(
          Buffer.from(options?.length === 5 ? "%PDF-" : "%PDF-test").toString(
            "base64",
          ),
        ),
    );
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
    mockGetPII.mockResolvedValue(null);
    mockDigest.mockResolvedValue(hexToArrayBuffer(AUDITED_SHA256));
    mockFontEncodeText.mockImplementation(() => undefined);
    mockPDFSave.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44]));

    const field = {
      setText: mockFieldSetText,
      updateAppearances: mockFieldUpdateAppearances,
    };
    mockPDFLoad.mockResolvedValue({
      embedFont: jest.fn().mockResolvedValue({
        encodeText: mockFontEncodeText,
      }),
      getForm: jest.fn(() => ({
        acroForm: { dict: { set: mockAcroDictSet } },
        getTextField: jest.fn(() => field),
      })),
      save: mockPDFSave,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function emitDownloadProgress(
    totalBytesWritten: number,
    totalBytesExpectedToWrite: number,
  ): void {
    const task = mockCreateDownloadResumable.mock.results[0]?.value as
      | {
          progressCallback: (progress: {
            totalBytesWritten: number;
            totalBytesExpectedToWrite: number;
          }) => void;
        }
      | undefined;
    task?.progressCallback({
      totalBytesWritten,
      totalBytesExpectedToWrite,
    });
  }

  function emitAppState(nextState: string): void {
    const listener = mockAddAppStateListener.mock.calls[0]?.[1] as
      | ((state: string) => void)
      | undefined;
    listener?.(nextState);
  }

  it("rejects a changed remote form before reading any PII", async () => {
    mockDigest.mockResolvedValue(new ArrayBuffer(32));

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("official form has changed");
    expect(mockPDFLoad).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("cancels a download whose declared size exceeds the template limit", async () => {
    mockResumableDownloadAsync.mockImplementationOnce(async () => {
      emitDownloadProgress(1, 10 * 1024 * 1024 + 1);
      return undefined;
    });

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("invalid or too large");

    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
    expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        headers: {
          Range: "bytes=0-10485760",
          "Accept-Encoding": "identity",
        },
      }),
      expect.any(Function),
    );
  });

  it("cancels a chunked download as soon as written bytes cross the limit", async () => {
    mockResumableDownloadAsync.mockImplementationOnce(async () => {
      emitDownloadProgress(10 * 1024 * 1024 + 1, -1);
      return undefined;
    });

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("invalid or too large");

    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("cancels the download if Android leaves the active app state", async () => {
    mockResumableDownloadAsync.mockImplementationOnce(async () => {
      emitAppState("background");
      return undefined;
    });

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("keep ReloGo open");

    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("does not start a download when the app is already backgrounded", async () => {
    (AppState as { currentState: string }).currentState = "background";

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("keep ReloGo open");

    expect(mockResumableDownloadAsync).not.toHaveBeenCalled();
    expect(mockCancelAsync).not.toHaveBeenCalled();
    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("does not cancel a download exactly at the template limit", async () => {
    mockResumableDownloadAsync.mockImplementationOnce(async () => {
      emitDownloadProgress(10 * 1024 * 1024, 10 * 1024 * 1024);
      return { status: 200 };
    });

    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");

    expect(mockCancelAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });

  it("rejects an unexpected resumable interruption before reading PII", async () => {
    mockResumableDownloadAsync.mockResolvedValueOnce(undefined);

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("could not be downloaded");

    expect(mockCancelAsync).not.toHaveBeenCalled();
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("keeps the post-download file-size check as a fallback", async () => {
    mockGetInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
      size: 10 * 1024 * 1024 + 1,
    });

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("invalid or too large");

    expect(mockCancelAsync).not.toHaveBeenCalled();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(mockGetPII).not.toHaveBeenCalled();
  });

  it("preserves non-WinAnsi field values for viewer-side appearances", async () => {
    mockGetPII
      .mockResolvedValueOnce("李明")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockFontEncodeText.mockImplementationOnce(() => {
      throw new Error("WinAnsi cannot encode");
    });

    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");

    expect(mockFieldSetText).toHaveBeenCalledWith("李明");
    expect(mockFieldUpdateAppearances).not.toHaveBeenCalled();
    expect(mockAcroDictSet).toHaveBeenCalledWith("NeedAppearances", true);
    expect(mockPDFSave).toHaveBeenCalledWith({
      updateFieldAppearances: false,
    });
  });

  it("deletes a resolved Android share only after the ten-minute grace", async () => {
    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");

    const outputPath = mockWriteAsStringAsync.mock.calls[0]?.[0] as string;
    expect(filledCacheDeleteCount()).toBe(0);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(outputPath, {
      idempotent: true,
    });

    await jest.advanceTimersByTimeAsync(10 * 60 * 1000 - 1);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(outputPath, {
      idempotent: true,
    });

    await jest.advanceTimersByTimeAsync(1);

    expect(mockDeleteAsync).toHaveBeenCalledWith(outputPath, {
      idempotent: true,
    });
    expect(filledCacheDeleteCount()).toBe(0);
  });

  it("retains recovery state and retries when exact-file deletion fails", async () => {
    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");
    const outputPath = filledPDFWritePaths()[0];
    const markerPath = expiryMarkerWritePaths()[0];
    let outputDeleteAttempts = 0;
    mockDeleteAsync.mockImplementation((path: string) => {
      if (path === outputPath && outputDeleteAttempts++ === 0) {
        return Promise.reject(new Error("file still busy"));
      }
      return Promise.resolve(undefined);
    });

    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(outputDeleteAttempts).toBe(1);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(markerPath, {
      idempotent: true,
    });
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(outputDeleteAttempts).toBe(2);
    expect(mockDeleteAsync).toHaveBeenCalledWith(markerPath, {
      idempotent: true,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("preserves a recent Android share during recovery and expires stale files", async () => {
    const now = Date.now();
    const recentName = `bc-health-coverage-form-recent-${now - 60_000}.pdf`;
    const expiredName = `bc-health-coverage-form-expired-${now - 600_000}.pdf`;
    const unknownName = "legacy-without-timestamp.pdf";
    mockReadDirectoryAsync.mockResolvedValueOnce([
      recentName,
      expiredName,
      unknownName,
    ]);

    await sweepTemporaryPDFs();

    const recentPath = `file:///cache/filled-pdfs/${recentName}`;
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(recentPath, {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      `file:///cache/filled-pdfs/${expiredName}`,
      { idempotent: true },
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      `file:///cache/filled-pdfs/${unknownName}`,
      { idempotent: true },
    );

    await jest.advanceTimersByTimeAsync(9 * 60 * 1000 - 1);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(recentPath, {
      idempotent: true,
    });
    await jest.advanceTimersByTimeAsync(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(recentPath, {
      idempotent: true,
    });
  });

  it("restores a share-return expiry marker after a process restart", async () => {
    const now = Date.now();
    const pdfName = `bc-health-coverage-form-old-${now - 3_600_000}.pdf`;
    const expiresAt = now + 60_000;
    const markerName = `${pdfName}.${expiresAt}.expiry`;
    mockReadDirectoryAsync.mockResolvedValueOnce([pdfName, markerName]);

    await sweepTemporaryPDFs();

    const pdfPath = `file:///cache/filled-pdfs/${pdfName}`;
    const markerPath = `file:///cache/filled-pdfs/${markerName}`;
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(pdfPath, {
      idempotent: true,
    });

    await jest.advanceTimersByTimeAsync(60_000);

    expect(mockDeleteAsync).toHaveBeenCalledWith(pdfPath, {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith(markerPath, {
      idempotent: true,
    });
  });

  it("persists a clamped expiry instead of renewing a far-future marker", async () => {
    const now = Date.now();
    const pdfName = `bc-health-coverage-form-clock-${now - 60_000}.pdf`;
    const oldExpiresAt = now + 24 * 60 * 60 * 1000;
    const oldMarkerName = `${pdfName}.${oldExpiresAt}.expiry`;
    mockReadDirectoryAsync.mockResolvedValueOnce([pdfName, oldMarkerName]);

    await sweepTemporaryPDFs();

    const effectiveExpiresAt = now + 10 * 60 * 1000;
    const replacementMarkerPath =
      `file:///cache/filled-pdfs/${pdfName}.${effectiveExpiresAt}.expiry`;
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      replacementMarkerPath,
      "",
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      `file:///cache/filled-pdfs/${oldMarkerName}`,
      { idempotent: true },
    );
  });

  it("does not shorten or duplicate a live cleanup after a wall-clock jump", async () => {
    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");
    const outputPath = filledPDFWritePaths()[0];
    const outputName = outputPath.split("/").at(-1) as string;
    const markerName = expiryMarkerWritePaths()[0].split("/").at(-1) as string;
    expect(jest.getTimerCount()).toBe(1);

    jest.setSystemTime(Date.now() + 60 * 60 * 1000);
    mockReadDirectoryAsync.mockResolvedValueOnce([outputName, markerName]);
    await sweepTemporaryPDFs();

    expect(mockDeleteAsync).not.toHaveBeenCalledWith(outputPath, {
      idempotent: true,
    });
    expect(jest.getTimerCount()).toBe(1);
  });

  it("keeps independent grace timers for two rapid unique shares", async () => {
    mockRandomUUID
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000003")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000004");

    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");
    const firstPath = filledPDFWritePaths()[0];
    const firstName = firstPath.split("/").at(-1) as string;
    const firstMarkerName = expiryMarkerWritePaths()[0]
      .split("/")
      .at(-1) as string;
    await jest.advanceTimersByTimeAsync(60 * 1000);
    mockReadDirectoryAsync.mockResolvedValueOnce([
      firstName,
      firstMarkerName,
    ]);

    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");
    const secondPath = filledPDFWritePaths()[1];

    expect(secondPath).not.toBe(firstPath);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(firstPath, {
      idempotent: true,
    });
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(secondPath, {
      idempotent: true,
    });
    expect(jest.getTimerCount()).toBe(2);

    await jest.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(
      mockDeleteAsync.mock.calls.filter(([path]) => path === firstPath),
    ).toHaveLength(1);
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(secondPath, {
      idempotent: true,
    });

    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(
      mockDeleteAsync.mock.calls.filter(([path]) => path === secondPath),
    ).toHaveLength(1);
  });

  it("wipes a partial output immediately when writing fails", async () => {
    mockWriteAsStringAsync.mockRejectedValue(new Error("write failed"));

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("write failed");
    expect(filledCacheDeleteCount()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("wipes output immediately when sharing is unavailable", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("Sharing is not available");
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(filledCacheDeleteCount()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("wipes output immediately when the Android share rejects", async () => {
    mockShareAsync.mockRejectedValue(new Error("share failed"));

    await expect(
      fillAndSharePDF("UPDATE_HEALTH_CARD", "BC"),
    ).rejects.toThrow("share failed");
    expect(filledCacheDeleteCount()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("wipes output immediately after a successful iOS share", async () => {
    (Platform as { OS: string }).OS = "ios";

    await fillAndSharePDF("UPDATE_HEALTH_CARD", "BC");

    expect(filledCacheDeleteCount()).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
  });
});
