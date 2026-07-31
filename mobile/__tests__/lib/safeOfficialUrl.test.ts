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
});
