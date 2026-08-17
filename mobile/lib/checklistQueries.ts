import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { withAbortableTimeout } from "@/lib/startupTimeout";
import type {
  Province,
  ResolvedCorridorRule,
  UserTaskProgress,
} from "@/types/database";

export const CHECKLIST_QUERY_TIMEOUT_MS = 8_000;
export const CORRIDOR_RULES_QUERY_KEY = ["corridorRules"] as const;
export const TASK_PROGRESS_QUERY_KEY = ["taskProgress"] as const;

export function corridorRulesQueryKey(
  origin: Province | null,
  destination: Province | null,
) {
  return [...CORRIDOR_RULES_QUERY_KEY, origin, destination] as const;
}

export function taskProgressQueryKey(userId: string | undefined) {
  return [...TASK_PROGRESS_QUERY_KEY, userId] as const;
}

export async function fetchCorridorRules(
  origin: Province,
  destination: Province,
  parentSignal?: AbortSignal,
): Promise<ResolvedCorridorRule[]> {
  const { data, error } = await withAbortableTimeout(
    (requestSignal) =>
      supabase
        .rpc("resolve_corridor_rules", {
          p_origin_province: origin,
          p_dest_province: destination,
        })
        .abortSignal(requestSignal),
    CHECKLIST_QUERY_TIMEOUT_MS,
    parentSignal,
  );
  if (error) throw error;
  return data ?? [];
}

export async function fetchTaskProgress(
  userId: string,
  parentSignal?: AbortSignal,
): Promise<UserTaskProgress[]> {
  const { data, error } = await withAbortableTimeout(
    (requestSignal) =>
      supabase
        .from("user_task_progress")
        .select("*")
        .eq("user_id", userId)
        .abortSignal(requestSignal),
    CHECKLIST_QUERY_TIMEOUT_MS,
    parentSignal,
  );
  if (error) throw error;
  return data ?? [];
}

export function corridorRulesQueryOptions(
  origin: Province | null,
  destination: Province | null,
) {
  const isReady = !!origin && !!destination;
  return queryOptions({
    queryKey: corridorRulesQueryKey(origin, destination),
    enabled: isReady,
    staleTime: 5 * 60_000,
    retry: false,
    retryOnMount: false,
    queryFn: ({ signal }) =>
      fetchCorridorRules(origin!, destination!, signal),
  });
}

export function taskProgressQueryOptions(userId: string | undefined) {
  return queryOptions({
    queryKey: taskProgressQueryKey(userId),
    enabled: !!userId,
    staleTime: 30_000,
    retry: false,
    retryOnMount: false,
    queryFn: ({ signal }) => fetchTaskProgress(userId!, signal),
  });
}

/**
 * Start the two checklist requests only after the authoritative consent RPC
 * has confirmed current consent. The screen subscribes to these same keys, so
 * React Query reuses in-flight/cached work instead of launching duplicates.
 */
export async function prefetchChecklistQueries(
  queryClient: QueryClient,
  input: {
    userId: string;
    origin: Province | null;
    destination: Province | null;
  },
): Promise<void> {
  const requests: Promise<void>[] = [
    queryClient.prefetchQuery(taskProgressQueryOptions(input.userId)),
  ];

  if (input.origin && input.destination) {
    requests.push(
      queryClient.prefetchQuery(
        corridorRulesQueryOptions(input.origin, input.destination),
      ),
    );
  }

  await Promise.all(requests);
}
