import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { loadLocalProgress, saveLocalTaskStatus } from "@/lib/localJourney";
import { assertRequestActive, withAbortableTimeout } from "@/lib/startupTimeout";
import type { Province, ResolvedCorridorRule, TaskStatus } from "@/types/database";

export const CHECKLIST_QUERY_TIMEOUT_MS = 8_000;
export const CORRIDOR_RULES_QUERY_KEY = ["corridorRules"] as const;
export const TASK_PROGRESS_QUERY_KEY = ["localTaskProgress"] as const;

export function corridorRulesQueryKey(origin: Province | null, destination: Province | null) {
  return [...CORRIDOR_RULES_QUERY_KEY, origin, destination] as const;
}

export function taskProgressQueryKey(origin: Province | null, destination: Province | null) {
  return [...TASK_PROGRESS_QUERY_KEY, origin, destination] as const;
}

export function fetchCorridorRules(
  origin: Province,
  destination: Province,
  parentSignal?: AbortSignal,
): Promise<ResolvedCorridorRule[]> {
  return withAbortableTimeout(async (signal) => {
    const { data, error } = await supabase
      .rpc("resolve_corridor_rules", {
        p_origin_province: origin,
        p_dest_province: destination,
      })
      .abortSignal(signal);
    assertRequestActive(signal);
    if (error) throw error;
    return data ?? [];
  }, CHECKLIST_QUERY_TIMEOUT_MS, parentSignal);
}

export function corridorRulesQueryOptions(origin: Province | null, destination: Province | null) {
  const isReady = !!origin && !!destination;
  return queryOptions({
    queryKey: corridorRulesQueryKey(origin, destination),
    enabled: isReady,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: ({ signal }) => fetchCorridorRules(origin!, destination!, signal),
  });
}

export function taskProgressQueryOptions(origin: Province | null, destination: Province | null) {
  return queryOptions({
    queryKey: taskProgressQueryKey(origin, destination),
    enabled: !!origin && !!destination,
    staleTime: Infinity,
    queryFn: () => loadLocalProgress(origin!, destination!),
  });
}

export async function updateLocalProgress(
  origin: Province,
  destination: Province,
  taskRuleId: string,
  status: TaskStatus,
): Promise<void> {
  await saveLocalTaskStatus(origin, destination, taskRuleId, status);
}

export async function prefetchChecklistQueries(
  queryClient: QueryClient,
  input: { origin: Province | null; destination: Province | null },
): Promise<void> {
  if (!input.origin || !input.destination) return;
  await Promise.all([
    queryClient.prefetchQuery(corridorRulesQueryOptions(input.origin, input.destination)),
    queryClient.prefetchQuery(taskProgressQueryOptions(input.origin, input.destination)),
  ]);
}
