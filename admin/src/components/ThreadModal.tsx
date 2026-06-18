import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  SupportMessage,
  SupportMessageSender,
  SupportThread,
  SupportThreadStatus,
} from "../types/database";

interface ThreadModalProps {
  threadId: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<SupportThreadStatus, string> = {
  AI: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  AWAITING_HUMAN: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  HUMAN: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const STATUS_LABELS: Record<SupportThreadStatus, string> = {
  AI: "AI",
  AWAITING_HUMAN: "Awaiting human",
  HUMAN: "Human",
  RESOLVED: "Resolved",
};

// Per-sender bubble styling. Admin (us) right-aligned blue; user left grey;
// AI left slate with a distinct accent so the transcript reads clearly.
const SENDER_META: Record<
  SupportMessageSender,
  { label: string; align: "left" | "right"; bubble: string }
> = {
  user: {
    label: "User",
    align: "left",
    bubble: "bg-slate-700 text-slate-100",
  },
  ai: {
    label: "AI",
    align: "left",
    bubble: "border border-slate-600 bg-slate-800 text-slate-200",
  },
  admin: {
    label: "Admin",
    align: "right",
    bubble: "bg-blue-600 text-white",
  },
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ThreadModal({ threadId, onClose }: ThreadModalProps) {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "takeover" | "resolve">(
    null,
  );

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // ── Initial load: thread + its messages ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [threadRes, msgRes] = await Promise.all([
        supabase
          .from("support_threads")
          .select("*")
          .eq("id", threadId)
          .single(),
        supabase
          .from("support_messages")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      if (threadRes.error) {
        setError(threadRes.error.message);
      } else {
        setThread(threadRes.data);
      }
      if (msgRes.error) {
        setError(msgRes.error.message);
      } else {
        setMessages(msgRes.data ?? []);
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // ── Realtime: new messages on this thread appear live ─────────────────
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel(`support_thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const incoming = payload.new as SupportMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id)
              ? prev
              : [...prev, incoming],
          );
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
  }, [threadId]);

  // ── Keep the transcript scrolled to the newest message ────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, loading]);

  // ── Take over: admin starts handling the thread (AI stops) ────────────
  const handleTakeOver = async () => {
    if (!thread) return;
    setBusyAction("takeover");
    setError(null);

    const prev = thread.status;
    setThread({ ...thread, status: "HUMAN" }); // optimistic

    const { error: updateErr } = await supabase
      .from("support_threads")
      .update({ status: "HUMAN" })
      .eq("id", threadId);

    if (updateErr) {
      setError(updateErr.message);
      setThread({ ...thread, status: prev }); // rollback
    }
    setBusyAction(null);
  };

  // ── Mark resolved: close the thread ───────────────────────────────────
  const handleResolve = async () => {
    if (!thread) return;
    setBusyAction("resolve");
    setError(null);

    const prev = thread.status;
    setThread({ ...thread, status: "RESOLVED" }); // optimistic

    const { error: updateErr } = await supabase
      .from("support_threads")
      .update({ status: "RESOLVED" })
      .eq("id", threadId);

    if (updateErr) {
      setError(updateErr.message);
      setThread({ ...thread, status: prev }); // rollback
    }
    setBusyAction(null);
  };

  // ── Send an admin reply ───────────────────────────────────────────────
  const handleSend = async () => {
    const body = reply.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const { data, error: insertErr } = await supabase
      .from("support_messages")
      .insert({ thread_id: threadId, sender: "admin", body })
      .select()
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setSending(false);
      return;
    }

    // Optimistically append (realtime may also deliver it; de-dupe by id).
    if (data) {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data],
      );
    }
    setReply("");

    // Bump thread activity, and — unless it's resolved — mark it HUMAN-handled
    // now that a person has replied, so it leaves the "awaiting human" queue.
    const nextStatus: SupportThreadStatus =
      thread && thread.status === "RESOLVED" ? "RESOLVED" : "HUMAN";
    const { error: bumpErr } = await supabase
      .from("support_threads")
      .update({ last_message_at: new Date().toISOString(), status: nextStatus })
      .eq("id", threadId);
    if (bumpErr) {
      setError(bumpErr.message);
    } else if (thread) {
      setThread({ ...thread, status: nextStatus });
    }

    setSending(false);
  };

  const handleReplyKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const status = thread?.status;
  const canTakeOver = status === "AI" || status === "AWAITING_HUMAN";
  const isResolved = status === "RESOLVED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-white">
              {thread?.subject ?? "Support thread"}
            </h3>
            {thread && (
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${STATUS_STYLES[thread.status]}`}
                >
                  {STATUS_LABELS[thread.status]}
                </span>
                <span className="font-mono">
                  {thread.user_id.slice(0, 8)}…
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-400 transition hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No messages in this thread yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {messages.map((msg) => {
                const meta = SENDER_META[msg.sender];
                const isRight = meta.align === "right";
                return (
                  <li
                    key={msg.id}
                    className={`flex flex-col ${
                      isRight ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                      <span className="font-semibold">{meta.label}</span>
                      <span className="normal-case tracking-normal">
                        {fmtDateTime(msg.created_at)}
                      </span>
                    </div>
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${meta.bubble}`}
                    >
                      {msg.body}
                    </div>
                  </li>
                );
              })}
              <div ref={transcriptEndRef} />
            </ul>
          )}
        </div>

        {/* Footer: actions + reply composer */}
        <div className="border-t border-slate-700 px-6 py-4">
          {thread && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {canTakeOver && (
                <button
                  type="button"
                  onClick={handleTakeOver}
                  disabled={busyAction !== null}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {busyAction === "takeover" ? "Taking over…" : "Take over"}
                </button>
              )}
              {!isResolved && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={busyAction !== null}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {busyAction === "resolve" ? "Resolving…" : "Mark resolved"}
                </button>
              )}
              {status === "HUMAN" && (
                <span className="text-xs text-slate-500">
                  You are chatting directly with the user — the AI is paused for
                  this thread.
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleReplyKeyDown}
              rows={2}
              placeholder={
                isResolved
                  ? "This thread is resolved. Sending a reply will keep it resolved."
                  : "Type a reply… (⌘/Ctrl + Enter to send)"
              }
              className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || reply.trim().length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
