/**
 * Checklist screen — the core of the ReloGo experience.
 *
 * Builds the user's personalised relocation checklist by:
 * 1. Loading their profile (corridor + move date + vehicle/dependents flags)
 * 2. Calling the canonical corridor resolver (one exact/wildcard winner per
 *    task, with its ordered public official-source metadata)
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
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import { hasPDFTemplate } from "@/lib/pdfTemplates";
import { safeOfficialUrl } from "@/lib/safeOfficialUrl";
import { withAbortableTimeout } from "@/lib/startupTimeout";
import {
  CHECKLIST_QUERY_TIMEOUT_MS,
  CORRIDOR_RULES_QUERY_KEY,
  corridorRulesQueryOptions,
  taskProgressQueryKey,
  taskProgressQueryOptions,
} from "@/lib/checklistQueries";
import {
  ChecklistTask,
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
  canFillPDF: boolean;
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
  canFillPDF,
  isExpanded,
  isSharing,
  shareDisabled,
  today,
  onToggle,
  onExpand,
  onShare,
}: TaskCardProps) {
  const isCompleted = item.status === "COMPLETED";
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
          className="-ml-2 -mt-2 h-11 w-11 items-center justify-center"
          android_ripple={{ ...brandRipple, borderless: true, radius: 22 }}
          style={iosPressOpacity}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted }}
          accessibilityLabel={`Mark "${item.title}" as ${isCompleted ? "not done" : "done"}`}
        >
          <View
            className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
              isCompleted
                ? "border-brand-600 bg-brand-600"
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
                    : isCompleted
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
            {!item.isMandatory && (
              <View className="rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="text-xs font-semibold text-slate-600">
                  Optional
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

      {isExpanded && (
        <View className="ml-12 mt-3 border-t border-slate-100 pt-3">
          <Text className="text-xs font-semibold uppercase text-slate-500">
            Official {item.officialSources.length === 1 ? "source" : "sources"}
          </Text>
          {item.officialSources.map((source) => (
            <Pressable
              key={source.id}
              onPress={() => {
                const officialUrl = safeOfficialUrl(source.official_url);
                if (!officialUrl) {
                  Alert.alert(
                    "Couldn't open the official website",
                    "This official link is not available right now.",
                  );
                  return;
                }
                Linking.openURL(officialUrl).catch(() => {
                  Alert.alert(
                    "Couldn't open the official website",
                    "Please try again in a moment.",
                  );
                });
              }}
              className="mt-2 min-h-11 flex-row items-center rounded-xl bg-slate-50 px-3 py-2"
              android_ripple={subtleRipple}
              style={iosPressOpacity}
              accessibilityRole="link"
              accessibilityLabel={`Open ${source.agency_name} official website`}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color="#2563eb"
              />
              <Text className="ml-2 flex-1 text-sm font-semibold text-brand-700">
                {source.agency_name}
              </Text>
            </Pressable>
          ))}
          {item.officialSources.length === 0 && (
            <Text className="mt-2 text-sm text-slate-500">
              No official link is listed for this task yet.
            </Text>
          )}
        </View>
      )}

      {/* Fill & Share PDF — only for tasks with a registered template
          (all buttons disabled while any share runs) */}
      {canFillPDF && (
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
    // Startup seeds this exact row from get_policy_consent_state. Avoid an
    // immediate duplicate cellular request; profile mutations explicitly
    // invalidate this key.
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await withAbortableTimeout(
        (requestSignal) =>
          supabase
            .from("user_profiles")
            .select("*")
            .eq("id", userId!)
            .abortSignal(requestSignal)
            .single(),
        CHECKLIST_QUERY_TIMEOUT_MS,
        signal,
      );
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;
  const origin = profile?.origin_prov ?? null;
  const dest = profile?.dest_prov ?? null;
  const corridorReady = !!origin && !!dest;

  // 2. Canonical corridor rules + task/source metadata ───────────────
  const rulesQuery = useQuery(corridorRulesQueryOptions(origin, dest));

  // 3. Progress rows ───────────────────────────
  const progressQuery = useQuery(taskProgressQueryOptions(userId));

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
      if (rule.requires_vehicle && !profile.has_vehicle) return false;
      if (rule.requires_dependents && !profile.has_dependents) return false;
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
        taskKey: rule.task_key,
        title: rule.title_en,
        description: rule.base_description_en,
        requiresVehicle: rule.requires_vehicle,
        requiresDependents: rule.requires_dependents,
        daysDeadline: rule.days_deadline,
        isMandatory: rule.is_mandatory,
        status: progressByRuleId.get(rule.id) ?? "AVAILABLE",
        deadlineDate: deadline ? toISODate(deadline) : null,
        officialSources: rule.official_sources,
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
      const progressKey = taskProgressQueryKey(userId);
      const previousRow = queryClient
        .getQueryData<UserTaskProgress[]>(progressKey)
        ?.find((row) => row.task_rule_id === vars.taskRuleId);

      queryClient.setQueryData<UserTaskProgress[]>(
        progressKey,
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
        taskProgressQueryKey(userId),
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
      queryClient.invalidateQueries({ queryKey: taskProgressQueryKey(userId) });
    },
  });

  // ── Handlers ─────────────────────────────────

  function handleToggle(item: ChecklistTask) {
    if (!userId) return;
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

  async function prepareAndSharePDF(item: ChecklistTask) {
    // One share flow at a time: a second fillAndSharePDF would race the
    // first one's cache cleanup and iOS can't stack share sheets.
    if (
      sharingTaskKey !== null ||
      !dest ||
      !hasPDFTemplate(item.taskKey, dest)
    ) {
      return;
    }
    setSharingTaskKey(item.taskKey);
    try {
      // PDF generation pulls in pdf-lib and native sharing/crypto modules.
      // Load that heavy path only after an explicit user tap, never at launch.
      const { fillAndSharePDF } = await import("@/lib/pdfEngine");
      await fillAndSharePDF(item.taskKey, dest);
    } catch {
      // The button only renders for registered templates, so this is a
      // genuine download, validation, fill, or share failure, not a miss.
      Alert.alert(
        "Form not available",
        "Couldn't safely prepare the official form. Check your connection and try again.",
      );
    } finally {
      setSharingTaskKey(null);
    }
  }

  function handleSharePDF(item: ChecklistTask) {
    if (
      sharingTaskKey !== null ||
      !dest ||
      !hasPDFTemplate(item.taskKey, dest)
    ) {
      return;
    }

    Alert.alert(
      "Review before sharing",
      "ReloGo fills only matching fields. Review every entry, especially names and addresses with non-Latin characters, and complete all remaining fields before choosing where to share or save the PDF.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Prepare Form",
          onPress: () => {
            void prepareAndSharePDF(item);
          },
        },
      ],
    );
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
        queryClient.invalidateQueries({ queryKey: CORRIDOR_RULES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: taskProgressQueryKey(userId) }),
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
            Set your origin and destination province or territory in your
            profile to build your checklist.
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
                canFillPDF={hasPDFTemplate(item.taskKey, dest)}
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
