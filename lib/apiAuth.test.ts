import { describe, it, expect, vi } from "vitest";
import { hashApiToken, getBearerToken } from "./apiAuth";

describe("hashApiToken", () => {
  it("returns a hex SHA-256 hash", () => {
    const hash = hashApiToken("test-token-123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hashes for same input", () => {
    const a = hashApiToken("my-api-key");
    const b = hashApiToken("my-api-key");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = hashApiToken("token-a");
    const b = hashApiToken("token-b");
    expect(a).not.toBe(b);
  });

  it("trims whitespace before hashing", () => {
    const a = hashApiToken("  my-token  ");
    const b = hashApiToken("my-token");
    expect(a).toBe(b);
  });
});

describe("getBearerToken", () => {
  it("extracts token from valid Bearer header", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc123" },
    });
    expect(getBearerToken(req)).toBe("abc123");
  });

  it("returns null when no Authorization header", () => {
    const req = new Request("https://example.com");
    expect(getBearerToken(req)).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(getBearerToken(req)).toBeNull();
  });

  it("returns null for empty Bearer token", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer " },
    });
    expect(getBearerToken(req)).toBeNull();
  });

  it("trims whitespace from token", () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Bearer   my-token   " },
    });
    expect(getBearerToken(req)).toBe("my-token");
  });
});
