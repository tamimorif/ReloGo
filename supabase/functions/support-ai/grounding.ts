/**
 * Describe a corridor rule's deadline for the support-AI grounding prompt.
 *
 * The database contract is explicit: NULL means there is no fixed deadline,
 * while zero means the task is due on the user's move date.
 */
export function describeDeadline(daysDeadline: number | null): string {
  if (daysDeadline === null) {
    return "no fixed deadline";
  }

  if (daysDeadline === 0) {
    return "due on the move date";
  }

  return `due within ${daysDeadline} days of the move`;
}

const MAX_SOURCE_COUNT = 8;
const MAX_AGENCY_CHARACTERS = 160;
const MAX_SOURCE_URL_CHARACTERS = 2048;

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127;
}

function normalizeSingleLine(value: unknown, maxCharacters: number): string {
  if (typeof value !== "string") return "";

  const normalized = Array.from(value)
    .map((character) => isControlCharacter(character) ? " " : character)
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(normalized).slice(0, maxCharacters).join("");
}

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (
    value.length === 0 ||
    value.length > MAX_SOURCE_URL_CHARACTERS ||
    Array.from(value).some(isControlCharacter)
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function verifiedDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/u.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return null;
  return match[1];
}

/**
 * Format resolver-provided source metadata for the grounding prompt.
 *
 * The SQL resolver already orders and filters sources. This boundary preserves
 * that order while validating the JSON shape and HTTPS URL again, bounding the
 * prompt, and flattening labels so malformed metadata cannot add prompt lines.
 */
export function formatOfficialSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const formatted: string[] = [];
  for (const item of value) {
    if (formatted.length >= MAX_SOURCE_COUNT) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const source = item as Record<string, unknown>;
    const officialUrl = safeHttpsUrl(source.official_url);
    if (!officialUrl) continue;

    const agency = normalizeSingleLine(
      source.agency_name,
      MAX_AGENCY_CHARACTERS,
    ) || "Official source";
    const lastVerified = verifiedDate(source.last_verified);
    formatted.push(
      `${agency}: ${officialUrl}` +
        (lastVerified ? ` (verified ${lastVerified})` : ""),
    );
  }

  return formatted;
}

/** Keep model output inside support_messages.body's 4,000-character limit. */
export function normalizeSupportReply(
  value: string,
  maxCharacters = 4000,
): string {
  const trimmed = value.trim();
  if (maxCharacters <= 0) return "";

  const characters = Array.from(trimmed);
  if (characters.length <= maxCharacters) return trimmed;
  if (maxCharacters === 1) return "…";
  return `${characters.slice(0, maxCharacters - 1).join("").trimEnd()}…`;
}
