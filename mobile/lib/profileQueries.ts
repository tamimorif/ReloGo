import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withAbortableTimeout } from "@/lib/startupTimeout";

export const PROFILE_REQUEST_TIMEOUT_MS = 8_000;

/** Profile and checklist must share both their cache key and recovery policy. */
export function profileQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: ["profile", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await withAbortableTimeout(
        (requestSignal) =>
          supabase.from("user_profiles").select("*")
            .eq("id", userId!).abortSignal(requestSignal).single(),
        PROFILE_REQUEST_TIMEOUT_MS,
        signal,
      );
      if (error) throw error;
      return data;
    },
  });
}
