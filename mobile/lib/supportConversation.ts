import { supabase } from "@/lib/supabase";
import { assertRequestActive, withAbortableTimeout } from "@/lib/startupTimeout";
import type { SupportQuestion } from "@/lib/supportQuestions";
import type { SupportThreadStatus } from "@/types/database";

export const SUPPORT_REQUEST_TIMEOUT_MS = 10_000;
export const SUPPORT_AI_TIMEOUT_MS = 20_000;

/** Bound the entire initial load, including auth which has no abort option. */
export function loadSupportConversation(parentSignal?: AbortSignal) {
  return withAbortableTimeout(async (signal) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    assertRequestActive(signal);
    if (authError || !user) throw new Error("No active session");

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

/** Run after SUBSCRIBED to cover changes between the initial read and channel
 * activation. The screen merges messages and guards status against new events. */
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

export async function createSupportThread(
  userId: string, status: "AI" | "AWAITING_HUMAN", parentSignal?: AbortSignal,
) {
  const { data, error } = await withAbortableTimeout((signal) => supabase
    .from("support_threads").insert({ user_id: userId, status })
    .select().abortSignal(signal).single(), SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
  if (error) throw error;
  return data;
}

export async function updateSupportStatus(
  threadId: string, status: Exclude<SupportThreadStatus, "HUMAN">,
  parentSignal?: AbortSignal,
) {
  const { data, error } = await withAbortableTimeout((signal) => supabase
    .from("support_threads").update({ status }).eq("id", threadId)
    .select().abortSignal(signal).single(), SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
  if (error) throw error;
  return data;
}

export async function insertSupportQuestion(
  threadId: string, body: SupportQuestion, parentSignal?: AbortSignal,
) {
  const { data, error } = await withAbortableTimeout((signal) => supabase
    .from("support_messages").insert({ thread_id: threadId, sender: "user", body })
    .select().abortSignal(signal).single(), SUPPORT_REQUEST_TIMEOUT_MS, parentSignal);
  if (error) throw error;
  return data;
}

export async function requestSupportReply(threadId: string, parentSignal?: AbortSignal) {
  const { error } = await withAbortableTimeout((signal) => supabase.functions
    .invoke("support-ai", { body: { thread_id: threadId }, signal }),
  SUPPORT_AI_TIMEOUT_MS, parentSignal);
  if (error) throw error;
}
