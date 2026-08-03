/**
 * Allow only http/https URLs into <a href>. DB-sourced URLs are written by
 * the worker/service role today, but scheme-validate anyway so a javascript:
 * (or other non-web) URL can never become a clickable link in an admin's
 * session. Callers should render anything else as plain text.
 */
export function safeHttpUrl(
  url: string | null | undefined,
): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * Official task sources are deliberately HTTPS-only. Keep this stricter than
 * safeHttpUrl so a malformed or legacy non-TLS source can never become a
 * clickable link in the user-detail checklist.
 */
export function safeHttpsUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
