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
