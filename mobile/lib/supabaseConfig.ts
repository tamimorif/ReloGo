export type ResolvedSupabaseConfig = Readonly<{
  url: string;
  anonKey: string;
  error: string | null;
}>;

const FALLBACK_URL = "https://configuration.invalid";
const FALLBACK_ANON_KEY = "missing-supabase-anon-key";

/**
 * Validate public build-time configuration without throwing during module
 * evaluation. A broken release can then render the app's recovery UI instead
 * of crashing before the root error boundary mounts.
 */
export function resolveSupabaseConfig(
  rawUrl: string | undefined,
  rawAnonKey: string | undefined,
): ResolvedSupabaseConfig {
  const url = rawUrl?.trim() ?? "";
  const anonKey = rawAnonKey?.trim() ?? "";

  if (!url || !anonKey) {
    return {
      url: FALLBACK_URL,
      anonKey: FALLBACK_ANON_KEY,
      error: "Missing Supabase build configuration",
    };
  }

  try {
    const parsed = new URL(url);
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
      throw new Error("Supabase URL must use HTTPS");
    }
    if (!isLoopback && parsed.port) {
      throw new Error("Hosted Supabase URL must not use a custom port");
    }
    // Supabase JS appends /auth, /rest, and /functions routes itself. Accept
    // only a bare origin (plus an optional trailing slash) so credentials,
    // paths, queries, fragments, or non-default hosted ports cannot silently
    // produce a broken client base URL.
    if (url !== parsed.origin && url !== `${parsed.origin}/`) {
      throw new Error("Supabase URL must be an origin");
    }
  } catch {
    return {
      url: FALLBACK_URL,
      anonKey: FALLBACK_ANON_KEY,
      error: "Invalid Supabase build configuration",
    };
  }

  return { url, anonKey, error: null };
}
