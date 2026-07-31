import { resolveSupabaseConfig } from "../../lib/supabaseConfig";

describe("Supabase public configuration", () => {
  it("accepts a hosted HTTPS project", () => {
    expect(
      resolveSupabaseConfig(
        "https://example.supabase.co",
        "sb_publishable_example",
      ),
    ).toEqual({
      url: "https://example.supabase.co",
      anonKey: "sb_publishable_example",
      error: null,
    });
  });

  it("accepts local HTTP development", () => {
    expect(resolveSupabaseConfig("http://127.0.0.1:54321", "local-key").error)
      .toBeNull();
  });

  it("returns a safe fallback instead of throwing when values are absent", () => {
    const config = resolveSupabaseConfig(undefined, undefined);
    expect(config.error).toBe("Missing Supabase build configuration");
    expect(config.url).not.toContain("undefined");
  });

  it("rejects non-local plaintext URLs", () => {
    expect(resolveSupabaseConfig("http://example.com", "key").error).toBe(
      "Invalid Supabase build configuration",
    );
  });

  it.each([
    "https://user@example.supabase.co",
    "https://example.supabase.co:8443",
    "https://example.supabase.co/rest/v1",
    "https://example.supabase.co?preview=true",
    "https://example.supabase.co#fragment",
  ])("rejects a Supabase URL that is not a clean origin: %s", (url) => {
    expect(resolveSupabaseConfig(url, "key").error).toBe(
      "Invalid Supabase build configuration",
    );
  });
});
