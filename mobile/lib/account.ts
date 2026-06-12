/**
 * Account lifecycle — PIPEDA "Delete My Data" (Phase 2.4).
 *
 * Deletion order matters:
 *   1. Server side first — the delete_current_user() RPC removes the
 *      auth.users row, and ON DELETE CASCADE wipes user_profiles and
 *      user_task_progress. If this fails we abort so the user can retry.
 *   2. On-device PII (health card, licence, address) is wiped from the
 *      secure enclave.
 *   3. The local session is cleared. scope "local" because the server-side
 *      user no longer exists, so a network logout would fail.
 */
import { supabase } from "@/lib/supabase";
import { deleteAllPII } from "@/lib/secureStore";
import { wipeFilledPDFs } from "@/lib/pdfEngine";

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_current_user");
  if (error) {
    throw new Error(`Account deletion failed: ${error.message}`);
  }

  await deleteAllPII();
  await wipeFilledPDFs();

  await supabase.auth.signOut({ scope: "local" });
}
