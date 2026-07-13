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
