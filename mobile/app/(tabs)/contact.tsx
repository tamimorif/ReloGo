/**
 * Help & support chat screen.
 *
 * An in-app chat thread between the user, the ReloGo AI assistant, and (after
 * a human takeover) a support admin. There is NO email collection and nothing
 * is emailed from here — delivery is the chat thread itself, with live updates
 * over Supabase Realtime.
 *
 * Flow:
 *   - status 'AI'            → the support-ai Edge Function generates replies.
 *   - status 'AWAITING_HUMAN' → escalated; the AI has stopped; a human will reply.
 *   - status 'HUMAN'         → an admin is handling the conversation.
 *   - status 'RESOLVED'      → closed.
 * The user keeps ONE active conversation for simplicity (the most recent thread).
 *
 * PIPEDA: this screen NEVER reads or sends any on-device PII (name, DOB,
 * street address, driver's licence, health card). It does not touch
 * expo-secure-store / getPII. Users choose from a fixed set of general
 * questions, so there is no free-text path into the server transcript.
 *
 * This is a Tabs screen hidden from the tab bar (href: null) and drawing its
 * own header, so it provides its own back control via router.back().
 */
import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  createSupportThread,
  insertSupportQuestion,
  loadSupportConversation,
  requestSupportReply,
  reconcileSupportConversation,
  updateSupportStatus,
} from "@/lib/supportConversation";
import {
  SUPPORT_QUESTIONS,
  SupportQuestion,
} from "@/lib/supportQuestions";
import {
  SupportThread,
  SupportThreadStatus,
} from "@/types/database";

import {
  type ChatMessage,
  createSnapshotSequence,
  initialConversationState,
  supportConversationReducer,
} from "@/lib/supportConversationState";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Statuses where the AI is still answering (the Edge Function will reply).
function isAiActive(status: SupportThreadStatus): boolean {
  return status === "AI";
}

function senderLabel(sender: ChatMessage["sender"]): string {
  if (sender === "ai") return "AI assistant";
  if (sender === "admin") return "Support";
  return "You";
}

export default function HelpChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const newestMessageY = useRef(0);
  const requestScope = useRef<AbortController | null>(null);
  const actionBusy = useRef(false);
  const snapshotSequence = useRef(createSnapshotSequence());
  const threadRevision = useRef(0);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;

  const [conversation, dispatch] = useReducer(supportConversationReducer, initialConversationState);
  const { userId, thread, messages, needsRefresh } = conversation;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const threadId = thread?.id ?? null;
  const status = thread?.status ?? null;

  const upsertMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: "message", message });
  }, []);

  const setThread = useCallback((updated: SupportThread) => {
    threadRevision.current += 1;
    dispatch({ type: "thread", thread: updated });
  }, []);

  const requireRefresh = useCallback(() => {
    dispatch({ type: "refresh-required" });
    setLoadError(true);
  }, []);

  // ── Initial load: resolve user, most-recent thread, and its messages ──
  const loadConversation = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const signal = requestScope.current?.signal;
    if (!signal || signal.aborted) return;
    const sequence = snapshotSequence.current.begin();
    const revision = threadRevision.current;
    try {
      const conversation = await loadSupportConversation(signal);
      if (!snapshotSequence.current.isCurrent(sequence) || signal.aborted) return;
      dispatch({ type: "snapshot", snapshot: conversation, revision, recover: true });
    } catch {
      if (snapshotSequence.current.isCurrent(sequence) && !signal.aborted) setLoadError(true);
    } finally {
      if (snapshotSequence.current.isCurrent(sequence) && !signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const scope = new AbortController();
    requestScope.current = scope;
    void loadConversation();
    return () => scope.abort();
  }, [loadConversation]);

  // ── Realtime: subscribe to this thread's messages + status changes ──
  useEffect(() => {
    if (!threadId) return;
    const scope = new AbortController();

    const channel: RealtimeChannel = supabase
      .channel(`support-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          if (!scope.signal.aborted) upsertMessage(payload.new as ChatMessage);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_threads",
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          if (!scope.signal.aborted) setThread(payload.new as SupportThread);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus !== "SUBSCRIBED" || scope.signal.aborted) return;
        const sequence = snapshotSequence.current.begin();
        const revision = threadRevision.current;
        void reconcileSupportConversation(threadId, scope.signal).then((snapshot) => {
          if (!scope.signal.aborted && snapshotSequence.current.isCurrent(sequence)) {
            dispatch({ type: "snapshot", snapshot, revision, recover: false });
            setLoading(false);
          }
        }).catch(() => {
          if (!scope.signal.aborted && snapshotSequence.current.isCurrent(sequence)) {
            setLoading(false);
            requireRefresh();
          }
        });
      });

    return () => {
      scope.abort();
      supabase.removeChannel(channel);
    };
  }, [threadId, upsertMessage, setThread, requireRefresh]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(
      () => scrollRef.current?.scrollTo({ y: newestMessageY.current, animated: true }),
      50,
    );
    return () => clearTimeout(id);
  }, [messages.length]);

  // ── Send a message ──
  async function handleSend(question: SupportQuestion) {
    const signal = requestScope.current?.signal;
    if (actionBusy.current || needsRefresh || loading || loadError || !signal || signal.aborted) return;
    if (!userId) {
      Alert.alert("Not signed in", "Please restart the app and try again.");
      return;
    }

    const body = question;
    actionBusy.current = true;
    setSending(true);
    try {
      // 1. Ensure a thread exists (create one in 'AI' status if needed).
      let activeThread = thread;
      if (!activeThread) {
        const created = await createSupportThread(userId, "AI", signal);
        if (signal.aborted) return;
        activeThread = created;
        setThread(created);
      }

      // 1b. Reopen a closed conversation so it actually gets a response. We flip
      //     it back to 'AI'; the Edge Function then decides whether the AI may
      //     resume or it must go to a human (it re-escalates threads a human had
      //     already handled, so a prior human transcript is never sent to Gemini).
      if (activeThread.status === "RESOLVED") {
        const reopened = await updateSupportStatus(activeThread.id, "AI", signal);
        if (signal.aborted) return;
        activeThread = reopened;
        setThread(reopened);
      }

      // 2. Optimistically render the user's own bubble (Realtime confirms it).
      const optimistic: ChatMessage = {
        id: `pending-${Date.now()}`,
        thread_id: activeThread.id,
        sender: "user",
        body,
        created_at: new Date().toISOString(),
        pending: true,
      };
      upsertMessage(optimistic);

      // 3. Insert the user's message.
      const saved = await insertSupportQuestion(activeThread.id, question, signal);
      // Confirm the bubble even without Realtime; its real id deduplicates a
      // later event and an AI timeout cannot erase a successfully saved turn.
      if (signal.aborted) return;
      upsertMessage(saved);

      // 4. Trigger the AI ONLY while the thread is still AI-handled. Once
      //    escalated or taken over by a human, a person replies instead.
      if (isAiActive(activeThread.status)) {
        try {
          await requestSupportReply(activeThread.id, signal);
        } catch {
          if (signal.aborted) return;
          // A timeout does not prove the server failed. Escalate through the
          // same RLS-protected transition; its locked AI finalizer rechecks
          // ownership before saving any late reply.
          let escalated = false;
          try {
            const updated = await updateSupportStatus(
              activeThread.id, "AWAITING_HUMAN", signal,
            );
            if (signal.aborted) return;
            setThread(updated);
            escalated = true;
          } catch {
            if (signal.aborted) return;
            requireRefresh();
          }
          upsertMessage({
            id: `local-ai-unavailable-${Date.now()}`,
            thread_id: activeThread.id,
            sender: "ai",
            body: escalated
              ? "Our assistant is unavailable right now — a member of the support team will follow up here."
              : "Your question was saved, but we couldn't confirm a reply or reach support. Check your connection and tap Talk to a human to try again.",
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch {
      if (signal.aborted) return;
      requireRefresh();
      Alert.alert(
        "Couldn't confirm your message",
        "Your update may have been saved. Refresh the conversation before sending again.",
      );
    } finally {
      actionBusy.current = false;
      if (!signal.aborted) setSending(false);
    }
  }

  // ── Escalate to a human ──
  async function handleTalkToHuman() {
    const signal = requestScope.current?.signal;
    if (actionBusy.current || needsRefresh || loading || loadError || !signal || signal.aborted) return;
    if (!userId) {
      Alert.alert("Not signed in", "Please restart the app and try again.");
      return;
    }
    // Already with a human (or awaiting one)? Nothing to do.
    if (status === "AWAITING_HUMAN" || status === "HUMAN") return;

    actionBusy.current = true;
    setEscalating(true);
    try {
      const updated = thread
        ? await updateSupportStatus(thread.id, "AWAITING_HUMAN", signal)
        : await createSupportThread(userId, "AWAITING_HUMAN", signal);
      if (signal.aborted) return;
      setThread(updated);
    } catch {
      if (signal.aborted) return;
      requireRefresh();
      Alert.alert(
        "Couldn't reach support",
        "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      actionBusy.current = false;
      if (!signal.aborted) setEscalating(false);
    }
  }

  const handedOff = status === "AWAITING_HUMAN" || status === "HUMAN";
  const resolved = status === "RESOLVED";

  const headerBar = (
    <View
      className="flex-row items-center border-b border-slate-200 bg-white px-5 pb-4"
      style={{ paddingTop: insets.top + 12 }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="mr-3"
        activeOpacity={0.7}
      >
        <Ionicons name={"chevron-back" as IconName} size={26} color="#0f172a" />
      </TouchableOpacity>
      <Text
        className="flex-1 text-2xl font-bold text-slate-900"
        accessibilityRole="header"
      >
        Help
      </Text>
    </View>
  );

  // ── Loading / error guards ──
  if (loading) {
    return (
      <View className="flex-1 bg-slate-50">
        {headerBar}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </View>
    );
  }

  if (loadError || needsRefresh) {
    return (
      <View className="flex-1 bg-slate-50">
        {headerBar}
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons
            name={"cloud-offline-outline" as IconName}
            size={44}
            color="#94a3b8"
          />
          <Text className="mt-4 text-lg font-semibold text-slate-900">
            {needsRefresh ? "Refresh your conversation" : "Couldn't load your chat"}
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            {needsRefresh
              ? "Your last update may have been saved. Reload the conversation before sending again."
              : "Check your connection and try again."}
          </Text>
          <TouchableOpacity
            onPress={loadConversation}
            className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
            activeOpacity={0.8}
          >
            <Text className="text-base font-bold text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main chat ──
  return (
    <View className="flex-1 bg-slate-50">
      {headerBar}

      {/* Status banner after a human takeover */}
      {handedOff && (
        <View className="flex-row items-center bg-amber-50 px-5 py-2.5">
          <Ionicons name={"person" as IconName} size={14} color="#b45309" />
          <Text className="ml-1.5 flex-1 text-sm font-medium text-amber-800">
            We'll reply right here. The AI assistant has stepped aside.
          </Text>
        </View>
      )}
      {resolved && (
        <View className="flex-row items-center bg-slate-100 px-5 py-2.5">
          <Ionicons
            name={"checkmark-circle" as IconName}
            size={14}
            color="#475569"
          />
          <Text className="ml-1.5 flex-1 text-sm font-medium text-slate-600">
            This conversation is closed. Send a message to reopen it.
          </Text>
        </View>
      )}

      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        >
          {/* Privacy note — always visible */}
          <View className="mb-4 flex-row items-start rounded-xl bg-green-50 px-3.5 py-3">
            <Ionicons
              name={"lock-closed" as IconName}
              size={14}
              color="#16a34a"
            />
            <Text className="ml-2 flex-1 text-xs leading-4 text-green-800">
              Questions are fixed and never include your personal details.
              Licence and health card numbers stay on your device only.
            </Text>
          </View>

          {/* Empty state */}
          {messages.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-100 bg-white px-6 py-12">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <Ionicons
                  name={"chatbubbles-outline" as IconName}
                  size={30}
                  color="#2563eb"
                />
              </View>
              <Text className="mt-5 text-lg font-semibold text-slate-900">
                How can we help?
              </Text>
              <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500">
                Choose a general question below. Our assistant answers right
                away, and you can talk to a human any time.
              </Text>
            </View>
          ) : (
            messages.map((m, index) => {
              const mine = m.sender === "user";
              return (
                <View
                  key={m.id}
                  onLayout={index === messages.length - 1
                    ? (event) => { newestMessageY.current = event.nativeEvent.layout.y; }
                    : undefined}
                  className={`mb-3 ${largeText ? "max-w-full" : "max-w-[82%]"} ${mine ? "self-end" : "self-start"}`}
                >
                  {!mine && (
                    <Text className="mb-1 ml-1 text-xs font-semibold text-slate-400">
                      {senderLabel(m.sender)}
                    </Text>
                  )}
                  <View
                    className={`rounded-2xl px-4 py-2.5 ${
                      mine
                        ? "rounded-br-md bg-blue-600"
                        : m.sender === "admin"
                          ? "rounded-bl-md bg-white border border-slate-200"
                          : "rounded-bl-md bg-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-base ${
                        mine ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {m.body}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* AI typing hint while a send is in flight and the AI is active */}
          {sending && status !== null && isAiActive(status) && (
            <View className="mb-3 max-w-[82%] self-start">
              <Text className="mb-1 ml-1 text-xs font-semibold text-slate-400">
                AI assistant
              </Text>
              <View className="flex-row items-center rounded-2xl rounded-bl-md bg-slate-200 px-4 py-2.5">
                <ActivityIndicator size="small" color="#64748b" />
                <Text className="ml-2 text-sm text-slate-500">Typing…</Text>
              </View>
            </View>
          )}
          {/* Talk-to-a-human action (hidden once already handed off) */}
          {!handedOff && (
            <View className="border-t border-slate-100 bg-white px-4 pt-2.5">
              <TouchableOpacity
                onPress={handleTalkToHuman}
                disabled={escalating || sending}
                className="flex-row items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-2.5"
                activeOpacity={0.7}
              >
                {escalating ? (
                  <ActivityIndicator size="small" color="#475569" />
                ) : (
                  <>
                    <Ionicons
                      name={"person-outline" as IconName}
                      size={16}
                      color="#475569"
                    />
                    <Text className="ml-1.5 shrink text-center text-sm font-semibold text-slate-700">
                      Talk to a human
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Fixed-question composer: no free-text input can leave the device. */}
          <View
            className="border-t border-slate-200 bg-white px-4 pt-3"
            style={{ paddingBottom: insets.bottom + 8 }}
          >
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Choose a question
            </Text>
            <View className="flex-row flex-wrap justify-between">
              {SUPPORT_QUESTIONS.map((question) => (
                <TouchableOpacity
                  key={question}
                  onPress={() => handleSend(question)}
                  disabled={sending || escalating}
                  className={`mb-2 rounded-xl border px-3 py-2.5 ${largeText ? "w-full" : "w-[49%]"} ${
                    sending
                      ? "border-slate-100 bg-slate-100"
                      : "border-blue-200 bg-blue-50"
                  }`}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask: ${question}`}
                  accessibilityState={{ disabled: sending || escalating }}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      sending ? "text-slate-400" : "text-blue-800"
                    }`}
                  >
                    {question}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
