import { deleteAccount, signOutAccount } from "../../lib/account";
import { supabase } from "../../lib/supabase";
import { deleteAllPII } from "../../lib/secureStore";
import { wipeFilledPDFs } from "../../lib/pdfCleanup";

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    rpc: jest.fn(),
  },
}));

jest.mock("../../lib/secureStore", () => ({
  deleteAllPII: jest.fn(),
}));

jest.mock("../../lib/pdfCleanup", () => ({
  wipeFilledPDFs: jest.fn(),
}));

const mockSignOut = supabase.auth.signOut as jest.MockedFunction<
  typeof supabase.auth.signOut
>;
type DeleteCurrentUserRpc = (
  functionName: "delete_current_user",
) => Promise<{ data: null; error: { message: string } | null }>;
const mockRpc = supabase.rpc as unknown as jest.MockedFunction<
  DeleteCurrentUserRpc
>;
const mockDeleteAllPII = deleteAllPII as jest.MockedFunction<
  typeof deleteAllPII
>;
const mockWipeFilledPDFs = wipeFilledPDFs as jest.MockedFunction<
  typeof wipeFilledPDFs
>;
type SignOutError = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.signOut>>["error"]
>;

function authError(message: string): SignOutError {
  return new Error(message) as SignOutError;
}

describe("account lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteAllPII.mockResolvedValue(undefined);
    mockWipeFilledPDFs.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue({ error: null });
  });

  describe("signOutAccount", () => {
    it("wipes local PII and PDFs before remotely signing out", async () => {
      let finishPIIWipe!: () => void;
      let finishPDFWipe!: () => void;
      mockDeleteAllPII.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishPIIWipe = resolve;
          }),
      );
      mockWipeFilledPDFs.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishPDFWipe = resolve;
          }),
      );

      const signOutPromise = signOutAccount();

      expect(mockSignOut).not.toHaveBeenCalled();
      finishPIIWipe();
      await Promise.resolve();
      expect(mockSignOut).not.toHaveBeenCalled();
      finishPDFWipe();
      await signOutPromise;

      expect(mockDeleteAllPII).toHaveBeenCalledTimes(1);
      expect(mockWipeFilledPDFs).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledWith();
      expect(mockDeleteAllPII.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignOut.mock.invocationCallOrder[0],
      );
      expect(mockWipeFilledPDFs.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignOut.mock.invocationCallOrder[0],
      );
    });

    it("falls back to local sign-out when remote revocation fails", async () => {
      mockSignOut
        .mockResolvedValueOnce({ error: authError("network unavailable") })
        .mockResolvedValueOnce({ error: null });

      await expect(signOutAccount()).resolves.toBeUndefined();

      expect(mockSignOut).toHaveBeenNthCalledWith(1);
      expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    });

    it("attempts both local cleanup stores and keeps the session on cleanup failure", async () => {
      mockDeleteAllPII.mockRejectedValue(
        new Error("secure-store failure containing Jane Doe"),
      );

      let thrown: unknown;
      try {
        await signOutAccount();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toEqual(new Error("Local account data cleanup failed"));
      expect(String(thrown)).not.toContain("Jane Doe");
      expect(mockDeleteAllPII).toHaveBeenCalledTimes(1);
      expect(mockWipeFilledPDFs).toHaveBeenCalledTimes(1);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("sanitizes auth failures when neither remote nor local sign-out works", async () => {
      mockSignOut
        .mockRejectedValueOnce(new Error("session detail containing Jane Doe"))
        .mockResolvedValueOnce({
          error: authError("local session detail containing Jane Doe"),
        });

      let thrown: unknown;
      try {
        await signOutAccount();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toEqual(new Error("Secure sign-out failed"));
      expect(String(thrown)).not.toContain("Jane Doe");
    });
  });

  describe("deleteAccount", () => {
    it("wipes local data before server deletion, then locally signs out", async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await deleteAccount();

      expect(mockRpc).toHaveBeenCalledWith("delete_current_user");
      expect(mockDeleteAllPII).toHaveBeenCalledTimes(1);
      expect(mockWipeFilledPDFs).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
      expect(mockDeleteAllPII.mock.invocationCallOrder[0]).toBeLessThan(
        mockRpc.mock.invocationCallOrder[0],
      );
      expect(mockWipeFilledPDFs.mock.invocationCallOrder[0]).toBeLessThan(
        mockRpc.mock.invocationCallOrder[0],
      );
      expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignOut.mock.invocationCallOrder[0],
      );
    });

    it("keeps local data erased but retains the session when server deletion fails", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "database unavailable" },
      });

      await expect(deleteAccount()).rejects.toThrow("Account deletion failed");

      expect(mockDeleteAllPII).toHaveBeenCalledTimes(1);
      expect(mockWipeFilledPDFs).toHaveBeenCalledTimes(1);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("does not delete the server account when local erasure is incomplete", async () => {
      mockWipeFilledPDFs.mockRejectedValue(
        new Error("PDF cleanup detail containing Jane Doe"),
      );

      let thrown: unknown;
      try {
        await deleteAccount();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toEqual(new Error("Local account data cleanup failed"));
      expect(String(thrown)).not.toContain("Jane Doe");
      expect(mockDeleteAllPII).toHaveBeenCalledTimes(1);
      expect(mockWipeFilledPDFs).toHaveBeenCalledTimes(1);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("rejects with a sanitized error when the deleted account session remains local", async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });
      mockSignOut.mockResolvedValueOnce({
        error: authError("session detail containing Jane Doe"),
      });

      let thrown: unknown;
      try {
        await deleteAccount();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toEqual(new Error("Local session cleanup failed"));
      expect(String(thrown)).not.toContain("Jane Doe");
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    });
  });
});
