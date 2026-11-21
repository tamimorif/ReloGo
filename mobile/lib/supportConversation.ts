import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { CURRENT_CONSENT_VERSION } from "@/lib/legalConsent";
import { assertRequestActive, withAbortableTimeout } from "@/lib/startupTimeout";
import type { SupportQuestion } from "@/lib/supportQuestions";
import type { SupportMessage, SupportThread } from "@/types/database";

export const SUPPORT_REQUEST_TIMEOUT_MS = 10_000;
const CHAT_CACHE_PREFIX = "relogo.support-chat.v1:";

type ChatMessage = Pick<SupportMessage, "id" | "thread_id" | "sender" | "body" | "created_at">;
export type ConversationSnapshot = {
  userId: string;
  thread: SupportThread | null;
  messages: ChatMessage[];
};

async function ensureSupportUser(signal: AbortSignal) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  assertRequestActive(signal);
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  assertRequestActive(signal);
  if (error || !data.user) throw error ?? new Error("Support session unavailable");
  return data.user;
}

export async function loadCachedSupportConversation(parentSignal?: AbortSignal): Promise<ConversationSnapshot | null> {
  return withAbortableTimeout(async (signal) => {
    const { data: { session } } = await supabase.auth.getSession();
    assertRequestActive(signal);
    const userId = session?.user.id;
    if (!userId) return null;
    const raw = await AsyncStorage.getItem(`${CHAT_CACHE_PREFIX}${userId}`);
    assertRequestActive(signal);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ConversationSnapshot;
    } catch {
      await AsyncStorage.removeItem(`${CHAT_CACHE_PREFIX}${userId}`);
      return null;
    }
  }, SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
}

export async function saveCachedSupportConversation(snapshot: ConversationSnapshot): Promise<void> {
  await AsyncStorage.setItem(`${CHAT_CACHE_PREFIX}${snapshot.userId}`, JSON.stringify(snapshot));
}

export function loadSupportConversation(parentSignal?: AbortSignal) {
  return withAbortableTimeout(async (signal) => {
    const user = await ensureSupportUser(signal);
    const { error: consentError } = await supabase.rpc(
      "record_support_policy_acceptance",
      { p_consent_version: CURRENT_CONSENT_VERSION },
    ).abortSignal(signal);
    assertRequestActive(signal);
    if (consentError) throw consentError;

    const { data: threads, error: threadError } = await supabase
      .from("support_threads").select("*").eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false }).limit(1).abortSignal(signal);
    assertRequestActive(signal);
    if (threadError) throw threadError;
    const thread = threads?.[0] ?? null;
    if (!thread) return { userId: user.id, thread, messages: [] };

    const { data: messages, error: messageError } = await supabase
      .from("support_messages").select("*").eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }).abortSignal(signal);
    assertRequestActive(signal);
    if (messageError) throw messageError;
    return { userId: user.id, thread, messages: messages ?? [] };
  }, SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
}

export function reconcileSupportConversation(threadId: string, parentSignal?: AbortSignal) {
  return withAbortableTimeout(async (signal) => {
    const { data: thread, error: threadError } = await supabase
      .from("support_threads").select("*").eq("id", threadId)
      .abortSignal(signal).single();
    assertRequestActive(signal);
    if (threadError) throw threadError;
    const { data: messages, error: messageError } = await supabase
      .from("support_messages").select("*").eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }).abortSignal(signal);
    assertRequestActive(signal);
    if (messageError) throw messageError;
    return { userId: thread.user_id, thread, messages: messages ?? [] };
  }, SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
}

export async function createSupportThread(userId: string, parentSignal?: AbortSignal) {
  const { data, error } = await withAbortableTimeout((signal) => supabase
    .from("support_threads").insert({ user_id: userId, status: "AWAITING_HUMAN" })
    .select().abortSignal(signal).single(), SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
  if (error) throw error;
  return data;
}

export async function insertSupportQuestion(
  threadId: string,
  body: SupportQuestion,
  parentSignal?: AbortSignal,
) {
  const { data, error } = await withAbortableTimeout((signal) => supabase
    .from("support_messages").insert({ thread_id: threadId, sender: "user", body })
    .select().abortSignal(signal).single(), SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
  if (error) throw error;
  return data;
}
