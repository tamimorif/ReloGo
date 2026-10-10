import { shouldUseDarkAuthStatusBar } from "@/lib/authStatusBar";

describe("shouldUseDarkAuthStatusBar", () => {
  it("keeps light icons while the status bar remains over the blue header", () => {
    expect(shouldUseDarkAuthStatusBar(139, 200, 60)).toBe(false);
  });

  it("uses dark icons as the light form background reaches the status bar", () => {
    expect(shouldUseDarkAuthStatusBar(140, 200, 60)).toBe(true);
  });

  it("keeps the initial style until the header has been measured", () => {
    expect(shouldUseDarkAuthStatusBar(500, 0, 60)).toBe(false);
  });

  it("supports devices without a status-bar inset", () => {
    expect(shouldUseDarkAuthStatusBar(200, 200, 0)).toBe(true);
  });
});
