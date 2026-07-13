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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SUPPORT_QUESTIONS,
  SupportQuestion,
} from "@/lib/supportQuestions";
import {
  SupportMessage,
  SupportThread,
  SupportThreadStatus,
} from "@/types/database";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// A locally-rendered message. id may be a temporary client id for the user's
// own optimistic bubble until the real row arrives over Realtime.
type ChatMessage = Pick<
  SupportMessage,
  "id" | "thread_id" | "sender" | "body" | "created_at"
> & { pending?: boolean };

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

  const [userId, setUserId] = useState<string | null>(null);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const threadId = thread?.id ?? null;
  const status = thread?.status ?? null;

  // Merge a row into local state, de-duplicating by real id and clearing any
  // matching optimistic ('pending') user bubble. Realtime is the source of
  // truth, so this is safe to call from both the initial load and the channel.
  const upsertMessage = useCallback((row: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === row.id)) return prev;
      // Drop a pending optimistic copy of the same user message (matched on
      // sender + body) now that the real row has landed.
      const withoutPending =
        row.sender === "user"
          ? prev.filter(
              (m) => !(m.pending && m.sender === "user" && m.body === row.body),
            )
          : prev;
      const next = [...withoutPending, row];
      next.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return next;
    });
  }, []);

  // ── Initial load: resolve user, most-recent thread, and its messages ──
  const loadConversation = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No active session.");
      setUserId(user.id);

      // One active conversation: the user's most recently-updated thread.
      const { data: threadRows, error: threadError } = await supabase
        .from("support_threads")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false })
        .limit(1);
      if (threadError) throw threadError;

      const existing = threadRows?.[0] ?? null;
      setThread(existing);

      if (existing) {
        const { data: messageRows, error: messageError } = await supabase
          .from("support_messages")
          .select("*")
          .eq("thread_id", existing.id)
          .order("created_at", { ascending: true });
        if (messageError) throw messageError;
        setMessages(messageRows ?? []);
      } else {
        setMessages([]);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // ── Realtime: subscribe to this thread's messages + status changes ──
  useEffect(() => {
    if (!threadId) return;

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
          upsertMessage(payload.new as ChatMessage);
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
          setThread(payload.new as SupportThread);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, upsertMessage]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      50,
    );
    return () => clearTimeout(id);
  }, [messages.length]);

  // ── Send a message ──
  async function handleSend(question: SupportQuestion) {
    if (sending) return;
    if (!userId) {
      Alert.alert("Not signed in", "Please restart the app and try again.");
      return;
    }

    const body = question;
    setSending(true);
    try {
      // 1. Ensure a thread exists (create one in 'AI' status if needed).
      let activeThread = thread;
      if (!activeThread) {
        const { data: created, error: createError } = await supabase
          .from("support_threads")
          .insert({ user_id: userId, status: "AI" })
          .select()
          .single();
        if (createError) throw createError;
        activeThread = created;
        setThread(created);
      }

      // 1b. Reopen a closed conversation so it actually gets a response. We flip
      //     it back to 'AI'; the Edge Function then decides whether the AI may
      //     resume or it must go to a human (it re-escalates threads a human had
      //     already handled, so a prior human transcript is never sent to Gemini).
      if (activeThread.status === "RESOLVED") {
        const { data: reopened, error: reopenError } = await supabase
          .from("support_threads")
          .update({ status: "AI" })
          .eq("id", activeThread.id)
          .select()
          .single();
        if (reopenError) throw reopenError;
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
      setMessages((prev) => [...prev, optimistic]);

      // 3. Insert the user's message.
      const { error: insertError } = await supabase
        .from("support_messages")
        .insert({ thread_id: activeThread.id, sender: "user", body });
      if (insertError) throw insertError;

      // 4. Trigger the AI ONLY while the thread is still AI-handled. Once
      //    escalated or taken over by a human, a person replies instead.
      if (isAiActive(activeThread.status)) {
        const { error: fnError } = await supabase.functions.invoke(
          "support-ai",
          { body: { thread_id: activeThread.id } },
        );
        // A failed invoke means the function never ran, so its own graceful
        // fallback can't help: the user's message is saved but no reply will
        // ever arrive. Tell them with a LOCAL-ONLY bubble (never inserted via
        // the client — RLS limits client inserts to sender 'user') and hand
        // the thread to a human so it enters the admin queue instead of
        // silently stalling in 'AI'. Never surface raw error detail (it must
        // never leak keys).
        if (fnError) {
          const notice: ChatMessage = {
            id: `local-ai-unavailable-${Date.now()}`,
            thread_id: activeThread.id,
            sender: "ai",
            body: "Our assistant is unavailable right now — a member of the support team will follow up here.",
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, notice]);

          // Best-effort escalation (same update handleTalkToHuman performs):
          // if this also fails, the notice above still explains what happened
          // and a later message re-invokes the AI with full context.
          const { data: escalated } = await supabase
            .from("support_threads")
            .update({ status: "AWAITING_HUMAN" })
            .eq("id", activeThread.id)
            .select()
            .single();
          if (escalated) setThread(escalated);
        }
      }
    } catch {
      // Roll back the optimistic bubble; the fixed question stays available.
      setMessages((prev) => prev.filter((m) => !m.pending));
      Alert.alert(
        "Couldn't send",
        "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }

  // ── Escalate to a human ──
  async function handleTalkToHuman() {
    if (escalating) return;
    if (!userId) {
      Alert.alert("Not signed in", "Please restart the app and try again.");
      return;
    }
    // Already with a human (or awaiting one)? Nothing to do.
    if (status === "AWAITING_HUMAN" || status === "HUMAN") return;

    setEscalating(true);
    try {
      let activeThread = thread;
      if (!activeThread) {
        // Create the thread already escalated so the AI never answers it.
        const { data: created, error: createError } = await supabase
          .from("support_threads")
          .insert({ user_id: userId, status: "AWAITING_HUMAN" })
          .select()
          .single();
        if (createError) throw createError;
        setThread(created);
      } else {
        const { data: updated, error: updateError } = await supabase
          .from("support_threads")
          .update({ status: "AWAITING_HUMAN" })
          .eq("id", activeThread.id)
          .select()
          .single();
        if (updateError) throw updateError;
        setThread(updated);
      }
    } catch {
      Alert.alert(
        "Couldn't reach support",
        "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      setEscalating(false);
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
        className="text-2xl font-bold text-slate-900"
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

  if (loadError) {
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
            Couldn't load your chat
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            Check your connection and try again.
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
            messages.map((m) => {
              const mine = m.sender === "user";
              return (
                <View
                  key={m.id}
                  className={`mb-3 max-w-[82%] ${mine ? "self-end" : "self-start"}`}
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
                      className={`text-base leading-5 ${
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
        </ScrollView>

        {/* Talk-to-a-human action (hidden once already handed off) */}
        {!handedOff && (
          <View className="border-t border-slate-100 bg-white px-4 pt-2.5">
            <TouchableOpacity
              onPress={handleTalkToHuman}
              disabled={escalating}
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
                  <Text className="ml-1.5 text-sm font-semibold text-slate-700">
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
                disabled={sending}
                className={`mb-2 w-[49%] rounded-xl border px-3 py-2.5 ${
                  sending
                    ? "border-slate-100 bg-slate-100"
                    : "border-blue-200 bg-blue-50"
                }`}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Ask: ${question}`}
                accessibilityState={{ disabled: sending }}
              >
                <Text
                  className={`text-sm font-semibold leading-5 ${
                    sending ? "text-slate-400" : "text-blue-800"
                  }`}
                >
                  {question}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
