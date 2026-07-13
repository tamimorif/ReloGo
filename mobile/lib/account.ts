/**
 * Account lifecycle and on-device privacy cleanup.
 *
 * Both sign-out and account deletion must remove the PII vault and filled
 * PDFs before another anonymous account can use this device. Errors from
 * those stores are deliberately replaced with generic messages so a native
 * error can never echo sensitive user input.
 */
import { supabase } from "@/lib/supabase";
import { deleteAllPII } from "@/lib/secureStore";
import { wipeFilledPDFs } from "@/lib/pdfEngine";

async function wipeLocalAccountData(): Promise<void> {
  // Attempt both independent stores even if one fails. A partial wipe is not
  // safe enough to proceed to account switching, so keep the current session
  // active and let the user retry.
  const results = await Promise.allSettled([
    deleteAllPII(),
    wipeFilledPDFs(),
  ]);

  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Local account data cleanup failed");
  }
}

/**
 * Securely sign out an anonymous account.
 *
 * Local PII is cleared first. The normal Supabase sign-out then revokes the
 * refresh token remotely and clears the local session. If remote revocation
 * is unavailable, a local-only sign-out still prevents this device from
 * retaining the session.
 */
export async function signOutAccount(): Promise<void> {
  await wipeLocalAccountData();

  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return;
  } catch {
    // Fall through to the local-only safety path below.
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      throw error;
    }
  } catch {
    throw new Error("Secure sign-out failed");
  }
}

/**
 * PIPEDA "Delete My Data" flow.
 *
 * Deletion order matters:
 *   1. Wipe the on-device PII vault and filled-PDF cache now that the user has
 *      confirmed deletion. This prevents a successful server deletion from
 *      orphaning sensitive local data that can no longer be retried.
 *   2. Delete the server account and cascaded user rows. On failure the local
 *      session remains active so the server operation can be retried.
 *   3. Clear the now-invalid local session without a network request.
 */
export async function deleteAccount(): Promise<void> {
  await wipeLocalAccountData();

  const { error } = await supabase.rpc("delete_current_user");
  if (error) {
    throw new Error(`Account deletion failed: ${error.message}`);
  }

  try {
    const { error: signOutError } = await supabase.auth.signOut({
      scope: "local",
    });
    if (signOutError) {
      throw signOutError;
    }
  } catch {
    // The server account is already gone, but never report deletion as fully
    // complete while its local session may still be persisted. Do not expose
    // auth/session internals in the error.
    throw new Error("Local session cleanup failed");
  }
}
