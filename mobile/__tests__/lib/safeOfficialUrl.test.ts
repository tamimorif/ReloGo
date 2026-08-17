import { safeOfficialUrl } from "@/lib/safeOfficialUrl";

describe("safeOfficialUrl", () => {
  it("accepts public HTTPS URLs", () => {
    expect(safeOfficialUrl("https://www.ontario.ca/page/change-address"))
      .toBe("https://www.ontario.ca/page/change-address");
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "not a URL",
  ])("rejects unsafe URL %s", (value) => {
    expect(safeOfficialUrl(value)).toBeNull();
  });

  it.each([
    "https://user@example.com/official",
    "https://:password@example.com/official",
    "https://user:password@example.com/official",
  ])("rejects HTTPS URLs containing credentials: %s", (value) => {
    expect(safeOfficialUrl(value)).toBeNull();
  });
});
