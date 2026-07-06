import {
  addDays,
  formatDeadline,
  parseISODate,
  startOfToday,
  toISODate,
} from "../../lib/dateHelpers";

describe("parseISODate", () => {
  it("extracts the correct local calendar Y/M/D (month is 0-indexed)", () => {
    const d = parseISODate("2025-07-06");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(6);
  });

  it("anchors to local midnight (no time-of-day component)", () => {
    const d = parseISODate("2025-07-06");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe("addDays", () => {
  it("adds a positive offset", () => {
    expect(toISODate(addDays(parseISODate("2025-07-06"), 7))).toBe("2025-07-13");
  });

  it("returns the same date for a zero offset", () => {
    expect(toISODate(addDays(parseISODate("2025-07-06"), 0))).toBe("2025-07-06");
  });

  it("subtracts a negative offset across a month boundary", () => {
    expect(toISODate(addDays(parseISODate("2025-07-06"), -7))).toBe("2025-06-29");
  });

  it("crosses a year boundary", () => {
    expect(toISODate(addDays(parseISODate("2025-12-31"), 1))).toBe("2026-01-01");
  });

  it("does not mutate its input", () => {
    const original = parseISODate("2025-07-06");
    addDays(original, 30);
    expect(toISODate(original)).toBe("2025-07-06");
  });
});

describe("toISODate", () => {
  it("zero-pads single-digit months and days", () => {
    expect(toISODate(parseISODate("2025-01-05"))).toBe("2025-01-05");
  });
});

describe("timezone stability (the off-by-one guard)", () => {
  // The core invariant: round-tripping a date string through the local-anchored
  // helpers must return the SAME calendar date in ANY timezone. This is what
  // prevents the "evening move date shifts to the next day" UTC bug. These cases
  // are timezone-independent by construction (local midnight in, local fields out)
  // and include the sneaky boundaries: leap day and both DST switches (Canada).
  const dates = [
    "2024-02-29", // leap day
    "2025-01-01", // year start
    "2025-12-31", // year end
    "2025-03-09", // spring-forward (DST begins)
    "2025-11-02", // fall-back (DST ends)
    "2025-07-06", // ordinary day
  ];

  it.each(dates)("round-trips %s unchanged", (iso) => {
    expect(toISODate(parseISODate(iso))).toBe(iso);
  });

  it("adds a day correctly across the spring-forward DST boundary", () => {
    expect(toISODate(addDays(parseISODate("2025-03-08"), 1))).toBe("2025-03-09");
  });

  it("adds a day correctly across the fall-back DST boundary", () => {
    expect(toISODate(addDays(parseISODate("2025-11-01"), 1))).toBe("2025-11-02");
  });
});

describe("deadline pipeline (move_date + days_deadline)", () => {
  it("computes an absolute deadline from a move date and a day offset", () => {
    // Mirrors checklist.tsx: deadline = addDays(parseISODate(move_date), days_deadline)
    const move = parseISODate("2025-07-06");
    expect(toISODate(addDays(move, 14))).toBe("2025-07-20");
  });

  it("treats a 0-day deadline as the move date itself", () => {
    expect(toISODate(addDays(parseISODate("2025-07-06"), 0))).toBe("2025-07-06");
  });
});

describe("startOfToday", () => {
  it("returns today at local midnight", () => {
    const t = startOfToday();
    const now = new Date();
    expect(t.getHours()).toBe(0);
    expect(t.getMinutes()).toBe(0);
    expect(t.getSeconds()).toBe(0);
    expect(t.getMilliseconds()).toBe(0);
    expect(t.getFullYear()).toBe(now.getFullYear());
    expect(t.getMonth()).toBe(now.getMonth());
    expect(t.getDate()).toBe(now.getDate());
  });
});

describe("formatDeadline", () => {
  it("produces a human-readable label containing the year", () => {
    const label = formatDeadline(parseISODate("2025-07-06"));
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
    expect(label).toContain("2025");
  });
});
