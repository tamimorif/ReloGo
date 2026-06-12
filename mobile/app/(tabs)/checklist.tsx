/**
 * Checklist screen — the core of the ReloGo experience.
 *
 * Builds the user's personalised relocation checklist by:
 * 1. Loading their profile (corridor + move date + vehicle/dependents flags)
 * 2. Fetching corridor_task_rules joined with global_tasks, using the
 *    'ANY' wildcard corridor match on both origin and destination
 * 3. Filtering out tasks that don't apply (no vehicle / no dependents)
 * 4. Overlaying user_task_progress (missing row = AVAILABLE)
 * 5. Computing absolute deadlines (move_date + days_deadline)
 *
 * Completion toggles are optimistic: the cache is updated immediately,
 * rolled back on error, and re-validated on settle.
 */
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import { fillAndSharePDF } from "@/lib/pdfEngine";
import {
  ChecklistTask,
  CorridorTaskRule,
  GlobalTask,
  PROVINCE_LABELS,
  TaskStatus,
  UserTaskProgress,
} from "@/types/database";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** corridor_task_rules row with its embedded global_tasks parent. */
type RuleWithTask = CorridorTaskRule & { global_tasks: GlobalTask };

// ──────────────────────────────────────────────
// Date helpers (all local-time; move_date is a plain ISO date)
// ──────────────────────────────────────────────

function parseISODate(iso: string): Date {
  // Anchor to local midnight so the calendar date never shifts with TZ.
  return new Date(`${iso}T00:00:00`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function formatDeadline(date: Date): string {
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ──────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────

export default function ChecklistScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sharingTaskKey, setSharingTaskKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Profile ────────────────────────────────
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;
  const origin = profile?.origin_prov ?? null;
  const dest = profile?.dest_prov ?? null;
  const corridorReady = !!origin && !!dest;

  // 2. Corridor rules + tasks (wildcard match via two AND-ed .or() filters)
  const rulesQuery = useQuery({
    queryKey: ["corridorRules", origin, dest],
    enabled: corridorReady,
    queryFn: async (): Promise<RuleWithTask[]> => {
      const { data, error } = await supabase
        .from("corridor_task_rules")
        .select("*, global_tasks(*)")
        .or(`origin_province.eq.${origin},origin_province.eq.ANY`)
        .or(`dest_province.eq.${dest},dest_province.eq.ANY`)
        .returns<RuleWithTask[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Progress rows ───────────────────────────
  const progressQuery = useQuery({
    queryKey: ["taskProgress", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_task_progress")
        .select("*")
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 4. Derived checklist items ─────────────────
  const items: ChecklistTask[] = useMemo(() => {
    if (!profile || !rulesQuery.data) return [];

    const progressByRuleId = new Map<string, TaskStatus>(
      (progressQuery.data ?? []).map((row) => [row.task_rule_id, row.status]),
    );

    const moveDate = profile.move_date
      ? parseISODate(profile.move_date)
      : null;

    const visible = rulesQuery.data.filter((rule) => {
      const task = rule.global_tasks;
      if (task.requires_vehicle && !profile.has_vehicle) return false;
      if (task.requires_dependents && !profile.has_dependents) return false;
      return true;
    });

    const mapped: ChecklistTask[] = visible.map((rule) => {
      const deadline =
        moveDate && rule.days_deadline !== null
          ? addDays(moveDate, rule.days_deadline)
          : null;

      return {
        taskRuleId: rule.id,
        taskId: rule.task_id,
        taskKey: rule.global_tasks.task_key,
        title: rule.global_tasks.title_en,
        description: rule.global_tasks.base_description_en,
        requiresVehicle: rule.global_tasks.requires_vehicle,
        requiresDependents: rule.global_tasks.requires_dependents,
        daysDeadline: rule.days_deadline,
        isMandatory: rule.is_mandatory,
        status: progressByRuleId.get(rule.id) ?? "AVAILABLE",
        deadlineDate: deadline ? toISODate(deadline) : null,
      };
    });

    // Incomplete first, then nearest deadline (no deadline last).
    mapped.sort((a, b) => {
      const aDone = a.status === "COMPLETED" ? 1 : 0;
      const bDone = b.status === "COMPLETED" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (a.deadlineDate && b.deadlineDate) {
        return a.deadlineDate.localeCompare(b.deadlineDate);
      }
      if (a.deadlineDate) return -1;
      if (b.deadlineDate) return 1;
      return a.title.localeCompare(b.title);
    });

    return mapped;
  }, [profile, rulesQuery.data, progressQuery.data]);

  // 5. Optimistic completion toggle ────────────
  const toggleMutation = useMutation({
    mutationFn: async (vars: {
      taskRuleId: string;
      nextStatus: TaskStatus;
    }) => {
      const { error } = await supabase.from("user_task_progress").upsert(
        {
          user_id: userId!,
          task_rule_id: vars.taskRuleId,
          status: vars.nextStatus,
        },
        { onConflict: "user_id,task_rule_id" },
      );
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["taskProgress", userId] });

      // Snapshot only this task's row — restoring the whole array on error
      // would clobber other toggles' in-flight optimistic state.
      const previousRow = queryClient
        .getQueryData<UserTaskProgress[]>(["taskProgress", userId])
        ?.find((row) => row.task_rule_id === vars.taskRuleId);

      queryClient.setQueryData<UserTaskProgress[]>(
        ["taskProgress", userId],
        (old) => {
          const rows = old ?? [];
          const optimistic: UserTaskProgress = {
            user_id: userId ?? "",
            task_rule_id: vars.taskRuleId,
            status: vars.nextStatus,
            updated_at: new Date().toISOString(),
          };
          const exists = rows.some(
            (row) => row.task_rule_id === vars.taskRuleId,
          );
          return exists
            ? rows.map((row) =>
                row.task_rule_id === vars.taskRuleId ? optimistic : row,
              )
            : [...rows, optimistic];
        },
      );

      return { previousRow };
    },
    onError: (_error, vars, context) => {
      queryClient.setQueryData<UserTaskProgress[]>(
        ["taskProgress", userId],
        (old) => {
          const rows = old ?? [];
          if (context?.previousRow) {
            const restored = context.previousRow;
            return rows.map((row) =>
              row.task_rule_id === vars.taskRuleId ? restored : row,
            );
          }
          return rows.filter((row) => row.task_rule_id !== vars.taskRuleId);
        },
      );
      Alert.alert(
        "Update failed",
        "Couldn't save your progress. Please try again.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["taskProgress", userId] });
    },
  });

  // ── Handlers ─────────────────────────────────

  function handleToggle(item: ChecklistTask) {
    // LOCKED rows are not actionable — the engine unlocks them.
    if (!userId || item.status === "LOCKED") return;
    const nextStatus: TaskStatus =
      item.status === "COMPLETED" ? "AVAILABLE" : "COMPLETED";
    toggleMutation.mutate({ taskRuleId: item.taskRuleId, nextStatus });
  }

  function toggleExpanded(taskRuleId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskRuleId)) {
        next.delete(taskRuleId);
      } else {
        next.add(taskRuleId);
      }
      return next;
    });
  }

  async function handleSharePDF(item: ChecklistTask) {
    // One share flow at a time: a second fillAndSharePDF would race the
    // first one's cache cleanup and iOS can't stack share sheets.
    if (sharingTaskKey !== null) return;
    setSharingTaskKey(item.taskKey);
    try {
      await fillAndSharePDF(item.taskKey);
    } catch (error) {
      // Expected for most tasks — templates are on-boarded incrementally.
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't prepare this form. Please try again.";
      Alert.alert("Form not available", message);
    } finally {
      setSharingTaskKey(null);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
        queryClient.invalidateQueries({ queryKey: ["corridorRules"] }),
        queryClient.invalidateQueries({ queryKey: ["taskProgress", userId] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, userId]);

  function handleRetry() {
    if (profileQuery.isError) profileQuery.refetch();
    if (rulesQuery.isError) rulesQuery.refetch();
    if (progressQuery.isError) progressQuery.refetch();
  }

  // ── Render guards ────────────────────────────

  const showError =
    (profileQuery.isError && !profileQuery.data) ||
    (rulesQuery.isError && !rulesQuery.data) ||
    (progressQuery.isError && !progressQuery.data);

  const isLoading =
    profileQuery.isPending ||
    (corridorReady && (rulesQuery.isPending || progressQuery.isPending));

  if (showError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Ionicons
          name={"cloud-offline-outline" as IconName}
          size={44}
          color="#94a3b8"
        />
        <Text className="mt-4 text-lg font-semibold text-slate-900">
          Couldn't load your checklist
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={handleRetry}
          className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
          activeOpacity={0.8}
        >
          <Text className="text-base font-bold text-white">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!corridorReady) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Ionicons
          name={"map-outline" as IconName}
          size={44}
          color="#94a3b8"
        />
        <Text className="mt-4 text-lg font-semibold text-slate-900">
          Tell us about your move
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Set your origin and destination provinces in your profile to build
          your checklist.
        </Text>
      </View>
    );
  }

  const completedCount = items.filter(
    (item) => item.status === "COMPLETED",
  ).length;
  const progressPct =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const today = startOfToday();

  // ── Main list ────────────────────────────────

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#2563EB"
          colors={["#2563EB"]}
        />
      }
    >
      {/* Progress summary */}
      <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm font-medium text-slate-500">
          {origin ? PROVINCE_LABELS[origin] : "—"} →{" "}
          {dest ? PROVINCE_LABELS[dest] : "—"}
          {profile?.move_date
            ? ` · Moving ${formatDeadline(parseISODate(profile.move_date))}`
            : ""}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-slate-900">
          {completedCount} of {items.length} tasks done
        </Text>
        <View className="mt-3 flex-row overflow-hidden rounded-full bg-slate-100">
          <View
            className="h-2 rounded-full bg-blue-600"
            style={{ flex: progressPct }}
          />
          <View style={{ flex: 100 - progressPct }} />
        </View>
      </View>

      {/* Empty state */}
      {items.length === 0 && (
        <View className="items-center rounded-xl border border-slate-200 bg-white px-6 py-12">
          <Ionicons
            name={"checkmark-done-circle-outline" as IconName}
            size={44}
            color="#94a3b8"
          />
          <Text className="mt-4 text-lg font-semibold text-slate-900">
            No tasks yet
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            We don't have tasks for your corridor yet. Pull down to refresh —
            new rules are added regularly.
          </Text>
        </View>
      )}

      {/* Task rows */}
      {items.map((item) => {
        const isCompleted = item.status === "COMPLETED";
        const isLocked = item.status === "LOCKED";
        const isExpanded = expandedIds.has(item.taskRuleId);
        const deadline = item.deadlineDate
          ? parseISODate(item.deadlineDate)
          : null;
        const isOverdue = !!deadline && deadline < today && !isCompleted;
        const isSharing = sharingTaskKey === item.taskKey;
        const shareDisabled = sharingTaskKey !== null;

        return (
          <View
            key={item.taskRuleId}
            className="mb-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <View className="flex-row items-start">
              {/* Checkbox */}
              <TouchableOpacity
                onPress={() => handleToggle(item)}
                disabled={isLocked}
                className={`mt-0.5 h-7 w-7 items-center justify-center rounded-lg border-2 ${
                  isCompleted
                    ? "border-blue-600 bg-blue-600"
                    : isLocked
                      ? "border-slate-200 bg-slate-100"
                      : "border-slate-300 bg-white"
                }`}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isCompleted, disabled: isLocked }}
                accessibilityLabel={
                  isLocked
                    ? `"${item.title}" is locked`
                    : `Mark "${item.title}" as ${
                        isCompleted ? "not done" : "done"
                      }`
                }
              >
                {isCompleted && (
                  <Ionicons
                    name={"checkmark" as IconName}
                    size={18}
                    color="#ffffff"
                  />
                )}
                {isLocked && (
                  <Ionicons
                    name={"lock-closed" as IconName}
                    size={14}
                    color="#94a3b8"
                  />
                )}
              </TouchableOpacity>

              {/* Title + badges (tap to expand description) */}
              <TouchableOpacity
                onPress={() => toggleExpanded(item.taskRuleId)}
                className="ml-3 flex-1"
                activeOpacity={0.7}
              >
                <View className="flex-row items-start justify-between">
                  <Text
                    className={`flex-1 pr-2 text-base font-semibold ${
                      isCompleted
                        ? "text-slate-400 line-through"
                        : "text-slate-900"
                    }`}
                  >
                    {item.title}
                  </Text>
                  <Ionicons
                    name={
                      (isExpanded
                        ? "chevron-up"
                        : "chevron-down") as IconName
                    }
                    size={16}
                    color="#94a3b8"
                  />
                </View>

                {/* Badges */}
                <View className="mt-2 flex-row flex-wrap items-center gap-2">
                  {/* Deadline chip */}
                  {deadline ? (
                    <View
                      className={`flex-row items-center rounded-full px-2.5 py-1 ${
                        isOverdue
                          ? "bg-red-100"
                          : isCompleted
                            ? "bg-slate-100"
                            : "bg-blue-50"
                      }`}
                    >
                      <Ionicons
                        name={
                          (isOverdue
                            ? "alert-circle"
                            : "calendar-outline") as IconName
                        }
                        size={12}
                        color={
                          isOverdue
                            ? "#b91c1c"
                            : isCompleted
                              ? "#64748b"
                              : "#2563eb"
                        }
                      />
                      <Text
                        className={`ml-1 text-xs font-semibold ${
                          isOverdue
                            ? "text-red-700"
                            : isCompleted
                              ? "text-slate-500"
                              : "text-blue-700"
                        }`}
                      >
                        {isOverdue
                          ? `Overdue · ${formatDeadline(deadline)}`
                          : `Due ${formatDeadline(deadline)}`}
                      </Text>
                    </View>
                  ) : (
                    <View className="rounded-full bg-slate-100 px-2.5 py-1">
                      <Text className="text-xs font-medium text-slate-500">
                        No fixed deadline
                      </Text>
                    </View>
                  )}

                  {/* Mandatory badge */}
                  {item.isMandatory && (
                    <View className="rounded-full bg-amber-100 px-2.5 py-1">
                      <Text className="text-xs font-semibold text-amber-700">
                        Required
                      </Text>
                    </View>
                  )}
                </View>

                {/* Collapsible description */}
                {isExpanded && item.description.length > 0 && (
                  <Text className="mt-3 text-sm leading-5 text-slate-600">
                    {item.description}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Fill & Share PDF (all buttons disabled while any share runs) */}
            <TouchableOpacity
              onPress={() => handleSharePDF(item)}
              disabled={shareDisabled}
              className={`mt-3 flex-row items-center justify-center rounded-xl border py-2.5 ${
                shareDisabled
                  ? "border-slate-200 bg-slate-50"
                  : "border-blue-200 bg-blue-50"
              }`}
              activeOpacity={0.7}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <>
                  <Ionicons
                    name={"document-text-outline" as IconName}
                    size={16}
                    color="#2563eb"
                  />
                  <Text className="ml-1.5 text-sm font-semibold text-blue-700">
                    Fill & Share PDF
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}
