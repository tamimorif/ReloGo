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
import { Fragment, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import { fillAndSharePDF, hasPDFTemplate } from "@/lib/pdfEngine";
import {
  ChecklistTask,
  CorridorTaskRule,
  GlobalTask,
  PROVINCE_LABELS,
  TaskStatus,
  UserTaskProgress,
} from "@/types/database";
import {
  addDays,
  formatDeadline,
  parseISODate,
  startOfToday,
  toISODate,
} from "@/lib/dateHelpers";

/** corridor_task_rules row with its embedded global_tasks parent. */
type RuleWithTask = CorridorTaskRule & { global_tasks: GlobalTask };

// ──────────────────────────────────────────────
// Platform styling primitives
// ──────────────────────────────────────────────

/**
 * Soft card elevation, split per platform: a subtle shadow on iOS
 * (NativeWind shadow classes map to native shadow props) and a numeric
 * `elevation` on Android, where iOS shadow props are no-ops.
 */
const cardShadowClass = Platform.select({ ios: "shadow-sm", default: "" });
const cardElevation = Platform.OS === "android" ? { elevation: 2 } : undefined;

/** iOS press feedback (Android gets a ripple via `android_ripple`). */
function iosPressOpacity({ pressed }: { pressed: boolean }) {
  return Platform.OS === "ios" && pressed ? { opacity: 0.55 } : null;
}

const subtleRipple = { color: "rgba(15, 23, 42, 0.08)" };
const brandRipple = { color: "rgba(37, 99, 235, 0.14)" };

// ──────────────────────────────────────────────
// Render-time list sectioning (order-preserving with the memoized sort:
// overdue → due soon → no deadline → completed are contiguous by construction)
// ──────────────────────────────────────────────

type SectionKey = "overdue" | "dueSoon" | "noDeadline" | "completed";

const SECTION_LABELS: Record<SectionKey, string> = {
  overdue: "Overdue",
  dueSoon: "Due soon",
  noDeadline: "No deadline",
  completed: "Completed",
};

function sectionForItem(item: ChecklistTask, today: Date): SectionKey {
  if (item.status === "COMPLETED") return "completed";
  if (!item.deadlineDate) return "noDeadline";
  return parseISODate(item.deadlineDate) < today ? "overdue" : "dueSoon";
}

type SectionHeaderProps = {
  label: string;
  count: number;
  accent?: boolean;
  first: boolean;
};

function SectionHeader({ label, count, accent, first }: SectionHeaderProps) {
  return (
    <View
      className={`mb-3 flex-row items-center px-1 ${first ? "" : "mt-4"}`}
      accessibilityRole="header"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "task" : "tasks"}`}
    >
      <Text
        className={`text-xs font-semibold uppercase ${
          accent ? "text-red-600" : "text-slate-500"
        }`}
      >
        {label}
      </Text>
      <View
        className={`ml-2 rounded-full px-2 py-0.5 ${
          accent ? "bg-red-50" : "bg-slate-200"
        }`}
      >
        <Text
          className={`text-xs font-bold ${
            accent ? "text-red-700" : "text-slate-600"
          }`}
        >
          {count}
        </Text>
      </View>
      <View className="ml-3 h-px flex-1 bg-slate-200" />
    </View>
  );
}

// ──────────────────────────────────────────────
// Header (replaces the native navigator header)
// ──────────────────────────────────────────────

type ScreenHeaderProps = {
  topInset: number;
  routeLine: { origin: string; dest: string } | null;
  moveDateLabel: string | null;
  progress: {
    completed: number;
    total: number;
    pct: number;
    overdue: number;
  } | null;
};

function ScreenHeader({
  topInset,
  routeLine,
  moveDateLabel,
  progress,
}: ScreenHeaderProps) {
  return (
    <View
      className="border-b border-slate-200 bg-white px-5 pb-4"
      style={{ paddingTop: topInset + 12 }}
    >
      <Text
        className="text-3xl font-bold text-slate-900"
        accessibilityRole="header"
      >
        Checklist
      </Text>

      {routeLine && (
        <View className="mt-1.5 flex-row flex-wrap items-center">
          <Text className="text-sm font-semibold text-slate-600">
            {routeLine.origin}
          </Text>
          <View className="mx-1.5">
            <Ionicons
              name="arrow-forward"
              size={13}
              color="#2563eb"
            />
          </View>
          <Text className="text-sm font-semibold text-slate-600">
            {routeLine.dest}
          </Text>
          {moveDateLabel && (
            <Text className="text-sm text-slate-500">
              {`  ·  Moving ${moveDateLabel}`}
            </Text>
          )}
        </View>
      )}

      {progress && (
        <View className="mt-4">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm font-medium text-slate-500">
              {progress.completed} of {progress.total} tasks done
            </Text>
            <View className="flex-row items-baseline">
              {progress.overdue > 0 && (
                <Text className="text-sm font-semibold text-red-600">
                  {`${progress.overdue} overdue`}
                  <Text className="font-normal text-slate-300">{"  ·  "}</Text>
                </Text>
              )}
              <Text className="text-sm font-semibold text-brand-600">
                {progress.pct}%
              </Text>
            </View>
          </View>
          <View
            className="mt-2 h-1.5 flex-row overflow-hidden rounded-full bg-slate-100"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progress.pct }}
          >
            <View
              className="rounded-full bg-brand-600"
              style={{ flex: progress.pct }}
            />
            <View style={{ flex: 100 - progress.pct }} />
          </View>
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────
// Task card
// ──────────────────────────────────────────────

type TaskCardProps = {
  item: ChecklistTask;
  isExpanded: boolean;
  isSharing: boolean;
  shareDisabled: boolean;
  today: Date;
  onToggle: () => void;
  onExpand: () => void;
  onShare: () => void;
};

function TaskCard({
  item,
  isExpanded,
  isSharing,
  shareDisabled,
  today,
  onToggle,
  onExpand,
  onShare,
}: TaskCardProps) {
  const isCompleted = item.status === "COMPLETED";
  const isLocked = item.status === "LOCKED";
  const deadline = item.deadlineDate ? parseISODate(item.deadlineDate) : null;
  const isOverdue = !!deadline && deadline < today && !isCompleted;
  // While one share runs, only the OTHER buttons drop to the dimmed style —
  // the busy button keeps its brand tint behind the spinner.
  const shareDimmed = shareDisabled && !isSharing;

  return (
    <View
      className={`mb-3 rounded-2xl border border-slate-100 bg-white p-4 ${cardShadowClass}`}
      style={cardElevation}
    >
      <View className="flex-row items-start">
        {/* Checkbox — 44pt touch target wrapping a 28pt visual */}
        <Pressable
          onPress={onToggle}
          disabled={isLocked}
          className="-ml-2 -mt-2 h-11 w-11 items-center justify-center"
          android_ripple={{ ...brandRipple, borderless: true, radius: 22 }}
          style={iosPressOpacity}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted, disabled: isLocked }}
          accessibilityLabel={
            isLocked
              ? `"${item.title}" is locked`
              : `Mark "${item.title}" as ${isCompleted ? "not done" : "done"}`
          }
        >
          <View
            className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
              isCompleted
                ? "border-brand-600 bg-brand-600"
                : isLocked
                  ? "border-slate-200 bg-slate-100"
                  : "border-slate-300 bg-white"
            }`}
          >
            {isCompleted && (
              <Ionicons
                name="checkmark"
                size={16}
                color="#ffffff"
              />
            )}
            {isLocked && (
              <Ionicons
                name="lock-closed"
                size={13}
                color="#94a3b8"
              />
            )}
          </View>
        </Pressable>

        {/* Title + badges (tap to expand description) */}
        <Pressable
          onPress={onExpand}
          className="ml-1 flex-1"
          android_ripple={subtleRipple}
          style={iosPressOpacity}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityHint="Shows or hides the task details"
        >
          <View className="flex-row items-start justify-between">
            <Text
              className={`flex-1 pr-2 text-base font-semibold ${
                isCompleted
                  ? "text-slate-400 line-through"
                  : isLocked
                    ? "text-slate-500"
                    : "text-slate-900"
              }`}
            >
              {item.title}
            </Text>
            <View className="mt-1">
              <Ionicons
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={16}
                color="#94a3b8"
              />
            </View>
          </View>

          {/* Badges */}
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            {/* Deadline chip */}
            {deadline ? (
              <View
                className={`flex-row items-center rounded-full px-2.5 py-1 ${
                  isOverdue
                    ? "bg-red-50"
                    : isCompleted || isLocked
                      ? "bg-slate-100"
                      : "bg-brand-50"
                }`}
              >
                <Ionicons
                  name={isOverdue ? "alert-circle" : "calendar-outline"}
                  size={12}
                  color={
                    isOverdue
                      ? "#b91c1c"
                      : isCompleted || isLocked
                        ? "#64748b"
                        : "#2563eb"
                  }
                />
                <Text
                  className={`ml-1 text-xs font-semibold ${
                    isOverdue
                      ? "text-red-700"
                      : isCompleted || isLocked
                        ? "text-slate-500"
                        : "text-brand-700"
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
              <View className="rounded-full bg-amber-50 px-2.5 py-1">
                <Text className="text-xs font-semibold text-amber-700">
                  Required
                </Text>
              </View>
            )}

            {/* Locked badge */}
            {isLocked && (
              <View className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1">
                <Ionicons
                  name="lock-closed"
                  size={11}
                  color="#94a3b8"
                />
                <Text className="ml-1 text-xs font-medium text-slate-500">
                  Locked
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
        </Pressable>
      </View>

      {/* Fill & Share PDF — only for tasks with a registered template
          (all buttons disabled while any share runs) */}
      {hasPDFTemplate(item.taskKey) && (
      <Pressable
        onPress={onShare}
        disabled={shareDisabled}
        className={`mt-3 h-11 flex-row items-center justify-center overflow-hidden rounded-xl border ${
          shareDimmed
            ? "border-slate-100 bg-slate-50"
            : "border-brand-100 bg-brand-50"
        }`}
        android_ripple={brandRipple}
        style={iosPressOpacity}
        accessibilityRole="button"
        accessibilityState={{ disabled: shareDisabled, busy: isSharing }}
        accessibilityLabel={`Fill and share PDF for ${item.title}`}
      >
        {isSharing ? (
          <>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text className="ml-2 text-sm font-semibold text-brand-700">
              Preparing…
            </Text>
          </>
        ) : (
          <>
            <Ionicons
              name="document-text-outline"
              size={16}
              color={shareDimmed ? "#94a3b8" : "#2563eb"}
            />
            <Text
              className={`ml-1.5 text-sm font-semibold ${
                shareDimmed ? "text-slate-400" : "text-brand-700"
              }`}
            >
              Fill & Share PDF
            </Text>
          </>
        )}
      </Pressable>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────

export default function ChecklistScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

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
      // The button only renders for registered templates, so this is a
      // genuine failure (asset load, PDF parse, share sheet), not a miss.
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

  // ── Derived header display values ────────────

  const routeLine =
    origin && dest
      ? { origin: PROVINCE_LABELS[origin], dest: PROVINCE_LABELS[dest] }
      : null;
  const moveDateLabel = profile?.move_date
    ? formatDeadline(parseISODate(profile.move_date))
    : null;

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
      <View className="flex-1 bg-slate-50">
        <ScreenHeader
          topInset={insets.top}
          routeLine={routeLine}
          moveDateLabel={moveDateLabel}
          progress={null}
        />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Ionicons
              name="cloud-offline-outline"
              size={30}
              color="#64748b"
            />
          </View>
          <Text className="mt-5 text-lg font-semibold text-slate-900">
            Couldn't load your checklist
          </Text>
          <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500">
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            className="mt-6 h-12 items-center justify-center overflow-hidden rounded-full bg-brand-600 px-8"
            android_ripple={{ color: "rgba(255, 255, 255, 0.25)" }}
            style={iosPressOpacity}
            accessibilityRole="button"
            accessibilityLabel="Retry loading your checklist"
          >
            <Text className="text-base font-semibold text-white">
              Try Again
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50">
        <ScreenHeader
          topInset={insets.top}
          routeLine={routeLine}
          moveDateLabel={moveDateLabel}
          progress={null}
        />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
          <Text className="mt-3 text-sm text-slate-400">
            Building your checklist…
          </Text>
        </View>
      </View>
    );
  }

  if (!corridorReady) {
    return (
      <View className="flex-1 bg-slate-50">
        <ScreenHeader
          topInset={insets.top}
          routeLine={null}
          moveDateLabel={null}
          progress={null}
        />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <Ionicons
              name="map-outline"
              size={30}
              color="#2563eb"
            />
          </View>
          <Text className="mt-5 text-lg font-semibold text-slate-900">
            Tell us about your move
          </Text>
          <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500">
            Set your origin and destination provinces in your profile to build
            your checklist.
          </Text>
          <View
            className={`mt-6 flex-row items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 ${cardShadowClass}`}
            style={cardElevation}
          >
            <Ionicons
              name="person-circle-outline"
              size={16}
              color="#2563eb"
            />
            <Text className="ml-1.5 text-sm font-semibold text-slate-700">
              Profile tab → Set your corridor
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const completedCount = items.filter(
    (item) => item.status === "COMPLETED",
  ).length;
  const progressPct =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const today = startOfToday();

  // Render-time section bookkeeping (no change to the memoized sort).
  const sectionCounts: Record<SectionKey, number> = {
    overdue: 0,
    dueSoon: 0,
    noDeadline: 0,
    completed: 0,
  };
  for (const item of items) {
    sectionCounts[sectionForItem(item, today)] += 1;
  }
  const allDone = items.length > 0 && progressPct === 100;

  // ── Main list ────────────────────────────────

  return (
    <View className="flex-1 bg-slate-50">
      <ScreenHeader
        topInset={insets.top}
        routeLine={routeLine}
        moveDateLabel={moveDateLabel}
        progress={
          items.length > 0
            ? {
                completed: completedCount,
                total: items.length,
                pct: progressPct,
                overdue: sectionCounts.overdue,
              }
            : null
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 48,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
            colors={["#2563EB"]}
          />
        }
      >
        {/* Empty state */}
        {items.length === 0 && (
          <View
            className={`items-center rounded-2xl border border-slate-100 bg-white px-6 py-12 ${cardShadowClass}`}
            style={cardElevation}
          >
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
              <Ionicons
                name="checkmark-done-circle-outline"
                size={30}
                color="#2563eb"
              />
            </View>
            <Text className="mt-5 text-lg font-semibold text-slate-900">
              No tasks yet
            </Text>
            <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500">
              We don't have tasks for your corridor yet. Pull down to refresh —
              new rules are added regularly.
            </Text>
          </View>
        )}

        {/* 100%-complete celebration */}
        {allDone && (
          <View
            className={`mb-4 flex-row items-center rounded-2xl bg-brand-600 p-4 ${cardShadowClass}`}
            style={cardElevation}
            accessibilityRole="text"
            accessibilityLabel="All set for the move! Every task on your checklist is complete."
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-500">
              <Ionicons
                name="trophy-outline"
                size={20}
                color="#ffffff"
              />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold text-white">
                All set for the move!
              </Text>
              <Text className="mt-0.5 text-sm leading-5 text-brand-50">
                Every task on your checklist is complete.
              </Text>
            </View>
          </View>
        )}

        {/* Task rows (sorted: incomplete first, then completed) with
            render-time urgency sections — contiguous by construction */}
        {items.map((item, index) => {
          const section = sectionForItem(item, today);
          const prevSection =
            index > 0 ? sectionForItem(items[index - 1], today) : null;

          return (
            <Fragment key={item.taskRuleId}>
              {section !== prevSection && (
                <SectionHeader
                  label={SECTION_LABELS[section]}
                  count={sectionCounts[section]}
                  accent={section === "overdue"}
                  first={index === 0}
                />
              )}
              <TaskCard
                item={item}
                isExpanded={expandedIds.has(item.taskRuleId)}
                isSharing={sharingTaskKey === item.taskKey}
                shareDisabled={sharingTaskKey !== null}
                today={today}
                onToggle={() => handleToggle(item)}
                onExpand={() => toggleExpanded(item.taskRuleId)}
                onShare={() => handleSharePDF(item)}
              />
            </Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}
