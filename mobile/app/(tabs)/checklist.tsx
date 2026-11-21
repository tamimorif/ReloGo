/**
 * Checklist screen — the core of the ReloGo experience.
 *
 * Builds the user's local relocation checklist by:
 * 1. Reading the saved route from this device
 * 2. Calling the canonical corridor resolver (one exact/wildcard winner per
 *    task, with its ordered public official-source metadata)
 * 3. Filtering tasks for explicit No answers and labelling skipped questions
 * 4. Overlaying local task progress (missing checkmark = AVAILABLE)
 * 5. Showing timing as relative guidance without asking for a move date
 *
 * Completion toggles are local-first: the cache is updated immediately,
 * rolled back on error, and re-validated on settle.
 */
import { useCallback, useMemo, useState } from "react";
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
import { safeOfficialUrl } from "@/lib/safeOfficialUrl";
import { useJourney } from "@/app/_layout";
import {
  CORRIDOR_RULES_QUERY_KEY,
  corridorRulesQueryOptions,
  updateLocalProgress,
  taskProgressQueryKey,
  taskProgressQueryOptions,
} from "@/lib/checklistQueries";
import {
  PROVINCE_LABELS,
  type ChecklistTask,
  type TaskStatus,
} from "@/types/database";

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
// Header (replaces the native navigator header)
// ──────────────────────────────────────────────

type ScreenHeaderProps = {
  topInset: number;
  routeLine: { origin: string; dest: string } | null;
  progress: {
    completed: number;
    total: number;
    pct: number;
  } | null;
};

function ScreenHeader({ topInset, routeLine, progress }: ScreenHeaderProps) {
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
        </View>
      )}

      {progress && (
        <View className="mt-4">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm font-medium text-slate-500">
              {progress.completed} of {progress.total} tasks done
            </Text>
            <View className="flex-row items-baseline">
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
  onToggle: () => void;
  onExpand: () => void;
};

function TaskCard({ item, isExpanded, onToggle, onExpand }: TaskCardProps) {
  const isCompleted = item.status === "COMPLETED";
  const timingLabel =
    item.daysDeadline === null
      ? "No fixed timing"
      : item.daysDeadline === 0
        ? "By moving day"
        : `Within ${item.daysDeadline} ${
            item.daysDeadline === 1 ? "day" : "days"
          } after your move`;

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
            <View className="flex-row items-center rounded-full bg-slate-100 px-2.5 py-1">
              <Ionicons name="time-outline" size={12} color="#64748b" />
              <Text className="ml-1 text-xs font-medium text-slate-600">
                {timingLabel}
              </Text>
            </View>

            {item.requiresVehicle && (
              <View className="rounded-full bg-violet-50 px-2.5 py-1">
                <Text className="text-xs font-semibold text-violet-700">
                  If you have a vehicle
                </Text>
              </View>
            )}
            {item.requiresDependents && (
              <View className="rounded-full bg-violet-50 px-2.5 py-1">
                <Text className="text-xs font-semibold text-violet-700">
                  If moving with school-age children
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
    </View>
  );
}

// ──────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────

export default function ChecklistScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { journey } = useJourney();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  // The city/province route is saved on this device; only province codes
  // are sent to the public corridor-rule resolver.
  const origin = journey?.originProvince ?? null;
  const dest = journey?.destinationProvince ?? null;
  const corridorReady = !!origin && !!dest;

  // 2. Canonical corridor rules + task/source metadata ───────────────
  const rulesQuery = useQuery(corridorRulesQueryOptions(origin, dest));

  // 3. Progress rows ───────────────────────────
  const progressQuery = useQuery(taskProgressQueryOptions(origin, dest));

  // 4. Derived checklist items ─────────────────
  const items: ChecklistTask[] = useMemo(() => {
    if (!rulesQuery.data) return [];

    const progressByRuleId = progressQuery.data ?? {};

    const mapped: ChecklistTask[] = rulesQuery.data
      .filter(
        (rule) =>
          !(rule.requires_vehicle && journey?.hasVehicle === false) &&
          !(
            rule.requires_dependents &&
            journey?.hasSchoolAgeChildren === false
          ),
      )
      .map((rule) => ({
        taskRuleId: rule.id,
        taskId: rule.task_id,
        taskKey: rule.task_key,
        title: rule.title_en,
        description: rule.base_description_en,
        requiresVehicle: rule.requires_vehicle && journey?.hasVehicle !== true,
        requiresDependents:
          rule.requires_dependents && journey?.hasSchoolAgeChildren !== true,
        daysDeadline: rule.days_deadline,
        isMandatory: rule.is_mandatory,
        status: progressByRuleId[rule.id] ?? "AVAILABLE",
        officialSources: rule.official_sources,
      }));

    // Incomplete tasks come first, then required tasks, then alphabetical.
    mapped.sort((a, b) => {
      const aDone = a.status === "COMPLETED" ? 1 : 0;
      const bDone = b.status === "COMPLETED" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return mapped;
  }, [
    rulesQuery.data,
    progressQuery.data,
    journey?.hasVehicle,
    journey?.hasSchoolAgeChildren,
  ]);

  // 5. Optimistic completion toggle ────────────
  const toggleMutation = useMutation({
    mutationFn: async (vars: {
      taskRuleId: string;
      nextStatus: TaskStatus;
    }) => {
      if (!origin || !dest) throw new Error("Move route is missing");
      await updateLocalProgress(origin, dest, vars.taskRuleId, vars.nextStatus);
    },
    onMutate: async (vars) => {
      if (!origin || !dest) return { previous: {} as Record<string, TaskStatus> };

      const key = taskProgressQueryKey(origin, dest);
      const previous = queryClient.getQueryData<Record<string, TaskStatus>>(key) ?? {};
      queryClient.setQueryData<Record<string, TaskStatus>>(key, {
        ...previous,
        [vars.taskRuleId]: vars.nextStatus,
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (origin && dest) {
        queryClient.setQueryData(
          taskProgressQueryKey(origin, dest),
          context?.previous ?? {},
        );
      }
      Alert.alert(
        "Couldn't save this checkmark",
        "Please try again. Your checklist stays on this device.",
      );
    },
    onSettled: () => {
      if (origin && dest) queryClient.invalidateQueries({ queryKey: taskProgressQueryKey(origin, dest) });
    },
  });

  // ── Handlers ─────────────────────────────────

  function handleToggle(item: ChecklistTask) {
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



  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CORRIDOR_RULES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: taskProgressQueryKey(origin, dest) }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, origin, dest]);

  function handleRetry() {
    if (rulesQuery.isError) rulesQuery.refetch();
    if (progressQuery.isError) progressQuery.refetch();
  }

  // ── Derived header display values ────────────

  const routeLine =
    origin && dest && journey
      ? {
          origin: `${journey.originCity}, ${PROVINCE_LABELS[origin]}`,
          dest: `${journey.destinationCity}, ${PROVINCE_LABELS[dest]}`,
        }
      : null;
  // ── Render guards ────────────────────────────

  const showError =
    (rulesQuery.isError && !rulesQuery.data) ||
    (progressQuery.isError && !progressQuery.data);

  const isLoading =
    (corridorReady && (rulesQuery.isPending || progressQuery.isPending));

  if (showError) {
    return (
      <View className="flex-1 bg-slate-50">
        <ScreenHeader
          topInset={insets.top}
          routeLine={routeLine}
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
          progress={null}
        />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <Ionicons
              name="location-outline"
              size={30}
              color="#2563eb"
            />
          </View>
          <Text className="mt-5 text-lg font-semibold text-slate-900">
            Tell us about your move
          </Text>
          <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500">
            Add your starting and destination cities and provinces to build your
            checklist.
          </Text>
          <View
            className={`mt-6 flex-row items-center rounded-full border border-slate-200 bg-white px-4 py-2.5 ${cardShadowClass}`}
            style={cardElevation}
          >
            <Ionicons
              name="navigate-circle-outline"
              size={16}
              color="#2563eb"
            />
            <Text className="ml-1.5 text-sm font-semibold text-slate-700">
              Move tab → Set your route
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
  const allDone = items.length > 0 && progressPct === 100;

  // ── Main list ────────────────────────────────

  return (
    <View className="flex-1 bg-slate-50">
      <ScreenHeader
        topInset={insets.top}
        routeLine={routeLine}
        progress={
          items.length > 0
            ? {
                completed: completedCount,
                total: items.length,
                pct: progressPct,
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

        {items.map((item) => (
          <TaskCard
            key={item.taskRuleId}
            item={item}
            isExpanded={expandedIds.has(item.taskRuleId)}
            onToggle={() => handleToggle(item)}
            onExpand={() => toggleExpanded(item.taskRuleId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
