// ============================================================================
// ReloGo — Canadian Relocation Autopilot
// Supabase Edge Function: support-ai
//
// Generates an AI customer-support reply for a single chat thread, with built-in
// HUMAN TAKEOVER. The mobile client inserts the user's message (sender='user')
// into support_messages FIRST, then invokes this function with { thread_id }.
//
// Flow:
//   1. Verify the caller's JWT (Authorization header) -> caller user id (401).
//   2. With a service-role client, load the thread; 403 if it is not the
//      caller's. Skip (no Gemini call) unless status = 'AI'.
//   3. Load the thread's messages + the user's NON-PII corridor move data
//      (user_profiles -> corridor_task_rules + global_tasks, ANY-wildcard
//      matched) to GROUND the answer.
//   4. Call Gemini (free tier) for structured JSON { reply, escalate }.
//   5. Insert the AI reply (sender='ai', service role); if escalate, set the
//      thread status to 'AWAITING_HUMAN'. Always bump last_message_at.
//   6. Return { reply, escalate }.
//
// PIPEDA / safety:
//   - The model is instructed to NEVER ask for or accept driver's licence or
//     health-card numbers or any personal IDs, and to tell users not to share
//     them. Only non-PII move data (province corridor, task titles/deadlines)
//     is sent to Gemini.
//   - Once a thread leaves 'AI' (escalated or human-handled), it is NEVER sent
//     to Gemini again.
//   - GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY are read from the
//     environment (Supabase secrets) and are NEVER returned or logged.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

// Gemini model — free tier, easily editable.
const MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ----------------------------------------------------------------------------
// CORS (shared inline helper)
// ----------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ----------------------------------------------------------------------------
// System instruction for the support assistant.
// ----------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are the ReloGo support assistant. ReloGo is a Canadian inter-provincial relocation app that helps people complete the official tasks required when they move between provinces (e.g. exchanging a driver's licence, registering a vehicle, updating health coverage, updating their CRA address, registering children in school).

Answer ONLY general how-to and process questions, grounded in the relocation tasks and FAQ context provided to you. Keep replies brief, warm, and practical.

PRIVACY (critical): NEVER ask for, request, or accept a driver's licence number, health card number, date of birth, full name, street address, or any other personal identification number. If the user shares or offers any of these, gently tell them not to share personal ID numbers in chat and continue helping at a general level. ReloGo keeps those details only on the user's own device — you never have access to them and never need them.

ESCALATION: Set escalate = true (and write a short, warm hand-off reply telling them a member of the ReloGo support team will follow up here in this chat) when ANY of the following is true:
  - The user explicitly asks to talk to a person / human / agent.
  - The question is account-specific, requires looking at their personal data, or involves a complaint, refund, bug, or anything sensitive.
  - You cannot confidently answer from the provided context.
Do NOT mention team size, staffing, or give specific time promises. When escalate = false, answer the question directly and helpfully.

Always respond with the required JSON object only.`;

// ----------------------------------------------------------------------------
// Gemini response schema: { reply: string, escalate: boolean }
// ----------------------------------------------------------------------------
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    escalate: { type: "BOOLEAN" },
  },
  required: ["reply", "escalate"],
};

const FALLBACK_REPLY =
  "Thanks for reaching out. I'm having trouble answering that right now, " +
  "so I've flagged this for the ReloGo support team — someone will follow up " +
  "with you here in this chat. In the meantime, please don't share any " +
  "personal ID numbers (like a driver's licence or health card number) in chat.";

interface Thread {
  id: string;
  user_id: string;
  status: string;
}

interface ChatMessage {
  sender: string;
  body: string;
}

// ----------------------------------------------------------------------------
// Build the grounding context from the user's NON-PII corridor move data.
// ----------------------------------------------------------------------------
async function buildGroundingContext(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("user_profiles")
    .select(
      "origin_prov, dest_prov, move_date, has_vehicle, has_dependents",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.origin_prov || !profile.dest_prov) {
    return "The user has not yet set their move corridor. Offer general guidance about how ReloGo works.";
  }

  // Match rules for this corridor, honouring the 'ANY' wildcard on either side.
  const { data: rules } = await admin
    .from("corridor_task_rules")
    .select(
      "days_deadline, is_mandatory, origin_province, dest_province, global_tasks ( title_en, base_description_en, requires_vehicle, requires_dependents )",
    )
    .in("origin_province", [profile.origin_prov, "ANY"])
    .in("dest_province", [profile.dest_prov, "ANY"]);

  const lines: string[] = [];
  lines.push(
    `User is moving from ${profile.origin_prov} to ${profile.dest_prov}` +
      (profile.move_date ? ` around ${profile.move_date}.` : "."),
  );
  lines.push(
    `Vehicle: ${profile.has_vehicle ? "yes" : "no"}; dependents: ${
      profile.has_dependents ? "yes" : "no"
    }.`,
  );

  const applicable = (rules ?? []).filter((r: Record<string, unknown>) => {
    const t = r.global_tasks as Record<string, unknown> | null;
    if (!t) return false;
    if (t.requires_vehicle && !profile.has_vehicle) return false;
    if (t.requires_dependents && !profile.has_dependents) return false;
    return true;
  });

  if (applicable.length > 0) {
    lines.push("Relevant relocation tasks for this corridor:");
    for (const r of applicable) {
      const t = r.global_tasks as Record<string, unknown>;
      const deadline = r.days_deadline
        ? `due within ${r.days_deadline} days of the move`
        : "no fixed deadline";
      const mandatory = r.is_mandatory ? "mandatory" : "optional";
      lines.push(`- ${t.title_en} (${mandatory}, ${deadline}): ${t.base_description_en}`);
    }
  } else {
    lines.push(
      "No specific corridor tasks are configured; answer with general ReloGo guidance.",
    );
  }

  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Call Gemini and parse { reply, escalate }. Throws on any failure so the
// caller can insert a graceful fallback.
// ----------------------------------------------------------------------------
async function callGemini(
  apiKey: string,
  grounding: string,
  messages: ChatMessage[],
): Promise<{ reply: string; escalate: boolean }> {
  // Map the conversation into Gemini "contents". Defense-in-depth: never send
  // 'admin' (human) turns to Gemini. user -> user role, ai -> model role.
  const contents = messages
    .filter((m) => m.sender !== "admin")
    .map((m) => ({
      role: m.sender === "ai" ? "model" : "user",
      parts: [{ text: m.body }],
    }));

  const requestBody = {
    systemInstruction: {
      parts: [
        { text: SYSTEM_INSTRUCTION },
        { text: `\n\nGrounding context (non-PII move data):\n${grounding}` },
      ],
    },
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  };

  // Auth via the x-goog-api-key header (not the query string) so the key can
  // never land in URL/proxy access logs.
  const resp = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    // The Gemini error body does NOT contain the API key (sent via header), so
    // it is safe to surface for debugging.
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Gemini HTTP ${resp.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no text");
  }

  const parsed = JSON.parse(text);
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  const escalate = parsed.escalate === true;
  if (!reply) {
    throw new Error("Gemini returned an empty reply");
  }
  return { reply, escalate };
}

// ----------------------------------------------------------------------------
// Insert the AI message, optionally escalate, and bump last_message_at.
// ----------------------------------------------------------------------------
async function persistAiReply(
  // deno-lint-ignore no-explicit-any
  admin: any,
  threadId: string,
  reply: string,
  escalate: boolean,
): Promise<void> {
  await admin.from("support_messages").insert({
    thread_id: threadId,
    sender: "ai",
    body: reply,
  });

  const threadUpdate: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
  };
  if (escalate) {
    threadUpdate.status = "AWAITING_HUMAN";
  }

  await admin.from("support_threads").update(threadUpdate).eq("id", threadId);
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    // Misconfiguration — never echo which secret is missing in detail.
    return json({ error: "Server misconfiguration" }, 500);
  }

  // ---- 1. Authenticate the caller via their JWT. -------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const authClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const callerId = userData.user.id;

  // ---- Parse body. -------------------------------------------------------
  let threadId: string | undefined;
  try {
    const body = await req.json();
    threadId = body?.thread_id;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!threadId) {
    return json({ error: "thread_id is required" }, 400);
  }

  // ---- 2. Service-role client: load + authorize the thread. --------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: thread, error: threadErr } = await admin
    .from("support_threads")
    .select("id, user_id, status")
    .eq("id", threadId)
    .maybeSingle<Thread>();

  if (threadErr || !thread) {
    return json({ error: "Thread not found" }, 404);
  }
  if (thread.user_id !== callerId) {
    return json({ error: "Forbidden" }, 403);
  }

  // ---- 3. Only the AI answers when status = 'AI'. ------------------------
  if (thread.status !== "AI") {
    return json({ skipped: true });
  }

  // ---- 4. Load conversation + non-PII grounding context. ----------------
  const { data: messages } = await admin
    .from("support_messages")
    .select("sender, body")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const convo: ChatMessage[] = (messages ?? []) as ChatMessage[];
  if (convo.length === 0) {
    return json({ skipped: true });
  }

  // Safety: if a human has ever participated in this thread (e.g. it was taken
  // over and later reopened by the user), NEVER send the transcript to Gemini —
  // it may contain details the user shared privately with a support agent.
  // Re-escalate so a human picks it back up instead.
  if (convo.some((m) => m.sender === "admin")) {
    await admin
      .from("support_threads")
      .update({
        status: "AWAITING_HUMAN",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId);
    return json({ skipped: true, escalated: true });
  }

  const grounding = await buildGroundingContext(admin, callerId);

  // ---- 5/6. Call Gemini, then persist. On any error -> graceful fallback.
  if (!GEMINI_API_KEY) {
    await persistAiReply(admin, threadId, FALLBACK_REPLY, true);
    return json({
      reply: FALLBACK_REPLY,
      escalate: true,
      debug: "GEMINI_API_KEY is not set in the function environment",
    });
  }

  try {
    const { reply, escalate } = await callGemini(
      GEMINI_API_KEY,
      grounding,
      convo,
    );
    await persistAiReply(admin, threadId, reply, escalate);
    return json({ reply, escalate });
  } catch (err) {
    // TEMPORARY debug surface: the message is a Gemini API/transport error and
    // never contains the API key (sent via header) or the service-role key.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("support-ai: Gemini call failed; inserting fallback.", detail);
    await persistAiReply(admin, threadId, FALLBACK_REPLY, true);
    return json({ reply: FALLBACK_REPLY, escalate: true, debug: detail });
  }
});
