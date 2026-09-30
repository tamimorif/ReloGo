import { supabase } from "@/lib/supabase";
import { assertRequestActive, withAbortableTimeout } from "@/lib/startupTimeout";

export const POLICY_ACCEPTANCE_TIMEOUT_MS = 10_000;

/** Both acceptance and authoritative confirmation share a single deadline. */
export function acceptCurrentPolicies(parentSignal?: AbortSignal) {
  return withAbortableTimeout(async (signal) => {
    const { data: acceptedVersion, error } = await supabase
      .rpc("accept_current_policies").abortSignal(signal);
    assertRequestActive(signal);
    if (error || typeof acceptedVersion !== "string") {
      throw new Error("Policy acceptance was not confirmed");
    }

    const { data: state, error: stateError } = await supabase
      .rpc("get_policy_consent_state").abortSignal(signal);
    assertRequestActive(signal);
    if (
      stateError || state?.has_current_consent !== true || !state.profile ||
      state.accepted_version !== state.current_version ||
      acceptedVersion !== state.current_version
    ) {
      throw new Error("Policy acceptance was not confirmed");
    }
    return state.profile;
  }, POLICY_ACCEPTANCE_TIMEOUT_MS, parentSignal);
}
