/**
 * Treat database URLs as untrusted input even though the SQL resolver already
 * filters official sources. Only public HTTPS pages may be opened by the app.
 */
export function safeOfficialUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname ? parsed.href : null;
  } catch {
    return null;
  }
}
