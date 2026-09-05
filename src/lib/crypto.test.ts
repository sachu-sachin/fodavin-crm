import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
  safeEqual,
} from "./crypto";

const ORIGINAL_KEY = process.env.GOOGLE_TOKEN_ENC_KEY;

afterEach(() => {
  process.env.GOOGLE_TOKEN_ENC_KEY = ORIGINAL_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "1//0g-refresh-token-abc123";
    const ciphertext = encryptSecret(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const ciphertext = encryptSecret("");
    expect(decryptSecret(ciphertext)).toBe("");
  });

  it("produces the versioned, dot-delimited envelope format", () => {
    const ciphertext = encryptSecret("secret");
    const parts = ciphertext.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses a random IV, so encrypting the same plaintext twice differs", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-input");
    expect(decryptSecret(b)).toBe("same-input");
  });

  it("rejects a tampered ciphertext (GCM auth tag fails)", () => {
    const parts = encryptSecret("secret").split(".");
    // Flip a character in the ciphertext body.
    const tamperedData = parts[3].slice(0, -1) + (parts[3].slice(-1) === "A" ? "B" : "A");
    const tampered = [parts[0], parts[1], parts[2], tamperedData].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a malformed payload (wrong segment count)", () => {
    expect(() => decryptSecret("v1.only.two")).toThrow(/malformed/i);
  });

  it("rejects an unknown version prefix", () => {
    const parts = encryptSecret("secret").split(".");
    parts[0] = "v2";
    expect(() => decryptSecret(parts.join("."))).toThrow(/malformed|unknown/i);
  });
});

describe("hasEncryptionKey", () => {
  it("is true when a valid 32-byte base64 key is configured", () => {
    expect(hasEncryptionKey()).toBe(true);
  });

  it("is false when the key is unset", () => {
    delete process.env.GOOGLE_TOKEN_ENC_KEY;
    expect(hasEncryptionKey()).toBe(false);
  });

  it("is false when the key decodes to the wrong length", () => {
    process.env.GOOGLE_TOKEN_ENC_KEY = Buffer.from("too-short").toString("base64");
    expect(hasEncryptionKey()).toBe(false);
  });
});

describe("safeEqual", () => {
  it("is true for identical strings", () => {
    expect(safeEqual("state-abc", "state-abc")).toBe(true);
  });

  it("is false for different strings of the same length", () => {
    expect(safeEqual("state-abc", "state-xyz")).toBe(false);
  });

  it("is false for strings of different lengths", () => {
    expect(safeEqual("short", "much-longer-string")).toBe(false);
  });

  it("is false against an empty string", () => {
    expect(safeEqual("non-empty", "")).toBe(false);
  });
});
