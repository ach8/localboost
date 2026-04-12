import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return the value of an existing env variable", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const { getEnv } = await import("@/lib/env");
    expect(getEnv("OPENAI_API_KEY")).toBe("sk-test-key");
  });

  it("should throw when env variable is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv("OPENAI_API_KEY")).toThrow(
      "Missing required environment variable: OPENAI_API_KEY",
    );
  });
});
