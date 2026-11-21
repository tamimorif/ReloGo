/**
 * Help & support chat screen.
 *
 * A fixed-question chat with the human support team, with live updates over
 * Supabase Realtime. The conversation is cached on-device and stored remotely
 * so an administrator can reply.
 *
 * Flow:
 *   - status 'AWAITING_HUMAN' → waiting for a human support reply.
 *   - status 'HUMAN'         → an admin is handling the conversation.
 *   - status 'RESOLVED'      → closed.
 * The user sees the most recent thread; a new thread can be started after it is
 * resolved.
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
  loadCachedSupportConversation,
  loadSupportConversation,
  reconcileSupportConversation,
  saveCachedSupportConversation,
} from "@/lib/supportConversation";
import {
  SUPPORT_QUESTIONS,
  SupportQuestion,
} from "@/lib/supportQuestions";
import {
  SupportThread,
} from "@/types/database";

import {
  type ChatMessage,
  createSnapshotSequence,
  initialConversationState,
  supportConversationReducer,
} from "@/lib/supportConversationState";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function senderLabel(sender: ChatMessage["sender"]): string {
  if (sender === "ai") return "Earlier automated reply";
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
  const localMessageSequence = useRef(0);
  const snapshotSequence = useRef(createSnapshotSequence());
  const threadRevision = useRef(0);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;

  const [conversation, dispatch] = useReducer(supportConversationReducer, initialConversationState);
  const { userId, thread, messages, needsRefresh } = conversation;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);

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
    const signal = requestScope.current?.signal;
    if (!signal || signal.aborted) return;
    const sequence = snapshotSequence.current.begin();
    const revision = threadRevision.current;
    try {
      const cached = await loadCachedSupportConversation(signal);
      if (cached && snapshotSequence.current.isCurrent(sequence) && !signal.aborted) {
        dispatch({ type: "snapshot", snapshot: cached, revision, recover: false });
        setLoading(false);
      }
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
    void Promise.resolve().then(() => loadConversation());
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

  useEffect(() => {
    if (!userId) return;
    void saveCachedSupportConversation({ userId, thread, messages }).catch(() => undefined);
  }, [userId, thread, messages]);

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

    if (status === "RESOLVED") {
      Alert.alert("Conversation closed", "Start a new chat to contact support again.");
      return;
    }

    actionBusy.current = true;
    setSending(true);
    try {
      let activeThread = thread;
      if (!activeThread) {
        const created = await createSupportThread(userId, signal);
        if (signal.aborted) return;
        activeThread = created;
        dispatch({ type: "snapshot", snapshot: { userId, thread: created, messages: [] }, revision: threadRevision.current, recover: false });
      }

      const optimistic: ChatMessage = {
        id: `pending-${++localMessageSequence.current}`,
        thread_id: activeThread.id,
        sender: "user",
        body: question,
        created_at: new Date().toISOString(),
        pending: true,
      };
      upsertMessage(optimistic);

      const saved = await insertSupportQuestion(activeThread.id, question, signal);
      if (signal.aborted) return;
      upsertMessage(saved);
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

  async function handleStartNewChat() {
    const signal = requestScope.current?.signal;
    if (actionBusy.current || needsRefresh || loading || loadError || !signal || signal.aborted) return;
    if (!userId) {
      Alert.alert("Not signed in", "Please restart the app and try again.");
      return;
    }
    if (status !== "RESOLVED") return;

    actionBusy.current = true;
    try {
      const created = await createSupportThread(userId, signal);
      if (signal.aborted) return;
      threadRevision.current += 1;
      dispatch({ type: "new-thread", thread: created });
    } catch {
      if (signal.aborted) return;
      requireRefresh();
      Alert.alert(
        "Couldn't reach support",
        "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      actionBusy.current = false;
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
            onPress={() => {
              setLoading(true);
              setLoadError(false);
              void loadConversation();
            }}
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

      {/* Human support status */}
      {handedOff && (
        <View className="flex-row items-center bg-amber-50 px-5 py-2.5">
          <Ionicons name={"person" as IconName} size={14} color="#b45309" />
          <Text className="ml-1.5 flex-1 text-sm font-medium text-amber-800">
            Your question is with the support team. Replies appear here.
          </Text>
        </View>
      )}
      {resolved && (
        <View className="flex-row items-center bg-slate-100 px-4 py-2.5">
          <Text className="flex-1 text-sm font-medium text-slate-600">This conversation is closed.</Text>
          <TouchableOpacity onPress={handleStartNewChat} className="rounded-lg bg-blue-600 px-3 py-2" accessibilityRole="button">
            <Text className="text-sm font-semibold text-white">New chat</Text>
          </TouchableOpacity>
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
              Support messages are stored so a person can reply and are also
              kept on this phone. Do not include names, addresses, or ID numbers.
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
                Choose a general question and a member of our support team will reply here.
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

          {/* Fixed-question composer keeps the first version free of personal free text. */}
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
                  disabled={sending || resolved}
                  className={`mb-2 rounded-xl border px-3 py-2.5 ${largeText ? "w-full" : "w-[49%]"} ${
                    sending
                      ? "border-slate-100 bg-slate-100"
                      : "border-blue-200 bg-blue-50"
                  }`}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask: ${question}`}
                    accessibilityState={{ disabled: sending || resolved }}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      sending || resolved ? "text-slate-400" : "text-blue-800"
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
