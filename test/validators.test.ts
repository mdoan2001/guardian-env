import { describe, it, expect } from "vitest";
import { string } from "../src/validators/string.js";
import { number } from "../src/validators/number.js";
import { boolean } from "../src/validators/boolean.js";
import { url } from "../src/validators/url.js";
import { email } from "../src/validators/email.js";
import { enumValidator } from "../src/validators/enum.js";
import { CustomValidator } from "../src/validators/base.js";

// ─── String ───────────────────────────────────────────────────────────────────

describe("string()", () => {
  it("parses a valid string", () => {
    const result = string().parse("hello");
    expect(result).toEqual({ ok: true, value: "hello" });
  });

  it("fails on undefined", () => {
    const result = string().parse(undefined);
    expect(result.ok).toBe(false);
  });

  it("fails on empty string", () => {
    const result = string().parse("");
    expect(result.ok).toBe(false);
  });

  it("optional() allows undefined", () => {
    const result = string().optional().parse(undefined);
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("optional() allows empty string", () => {
    const result = string().optional().parse("");
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("default() uses fallback on undefined", () => {
    const result = string().default("fallback").parse(undefined);
    expect(result).toEqual({ ok: true, value: "fallback" });
  });

  it("min() validates minimum length", () => {
    expect(string().min(5).parse("hi").ok).toBe(false);
    expect(string().min(2).parse("hi")).toEqual({ ok: true, value: "hi" });
  });

  it("max() validates maximum length", () => {
    expect(string().max(3).parse("toolong").ok).toBe(false);
    expect(string().max(5).parse("hi")).toEqual({ ok: true, value: "hi" });
  });

  it("matches() validates pattern", () => {
    expect(string().matches(/^\d+$/).parse("abc").ok).toBe(false);
    expect(string().matches(/^\d+$/).parse("123")).toEqual({ ok: true, value: "123" });
  });

  it("describe() stores description metadata", () => {
    const v = string().describe("The app port");
    expect(v._description).toBe("The app port");
  });
});

// ─── Number ───────────────────────────────────────────────────────────────────

describe("number()", () => {
  it("parses a valid integer", () => {
    expect(number().parse("42")).toEqual({ ok: true, value: 42 });
  });

  it("parses a valid float", () => {
    expect(number().parse("3.14")).toEqual({ ok: true, value: 3.14 });
  });

  it("fails on non-numeric string", () => {
    expect(number().parse("abc").ok).toBe(false);
  });

  it("default() uses fallback on undefined", () => {
    expect(number().default(3000).parse(undefined)).toEqual({ ok: true, value: 3000 });
  });

  it("min() validates lower bound", () => {
    expect(number().min(10).parse("5").ok).toBe(false);
    expect(number().min(10).parse("10")).toEqual({ ok: true, value: 10 });
  });

  it("max() validates upper bound", () => {
    expect(number().max(100).parse("200").ok).toBe(false);
    expect(number().max(100).parse("50")).toEqual({ ok: true, value: 50 });
  });

  it("int() rejects floats", () => {
    expect(number().int().parse("3.14").ok).toBe(false);
    expect(number().int().parse("3")).toEqual({ ok: true, value: 3 });
  });

  it("port() validates 1–65535 range", () => {
    expect(number().port().parse("0").ok).toBe(false);
    expect(number().port().parse("65536").ok).toBe(false);
    expect(number().port().parse("8080")).toEqual({ ok: true, value: 8080 });
  });
});

// ─── Boolean ──────────────────────────────────────────────────────────────────

describe("boolean()", () => {
  const truthy = ["true", "1", "yes", "on", "TRUE", "YES"];
  const falsy = ["false", "0", "no", "off", "FALSE", "NO"];

  for (const v of truthy) {
    it(`parses "${v}" as true`, () => {
      expect(boolean().parse(v)).toEqual({ ok: true, value: true });
    });
  }

  for (const v of falsy) {
    it(`parses "${v}" as false`, () => {
      expect(boolean().parse(v)).toEqual({ ok: true, value: false });
    });
  }

  it("fails on invalid boolean string", () => {
    expect(boolean().parse("maybe").ok).toBe(false);
  });

  it("default() uses fallback", () => {
    expect(boolean().default(true).parse(undefined)).toEqual({ ok: true, value: true });
  });
});

// ─── URL ──────────────────────────────────────────────────────────────────────

describe("url()", () => {
  it("parses valid https URL", () => {
    expect(url().parse("https://example.com")).toEqual({
      ok: true,
      value: "https://example.com",
    });
  });

  it("parses valid http URL", () => {
    expect(url().parse("http://localhost:3000")).toEqual({
      ok: true,
      value: "http://localhost:3000",
    });
  });

  it("fails on invalid URL", () => {
    expect(url().parse("not-a-url").ok).toBe(false);
  });

  it("fails on disallowed protocol", () => {
    expect(url().parse("ftp://example.com").ok).toBe(false);
  });

  it("protocols() allows custom protocols", () => {
    expect(url().protocols("ftp", "sftp").parse("ftp://example.com")).toEqual({
      ok: true,
      value: "ftp://example.com",
    });
  });

  it("optional() allows undefined", () => {
    expect(url().optional().parse(undefined)).toEqual({ ok: true, value: undefined });
  });
});

// ─── Email ────────────────────────────────────────────────────────────────────

describe("email()", () => {
  it("parses a valid email", () => {
    expect(email().parse("user@example.com")).toEqual({
      ok: true,
      value: "user@example.com",
    });
  });

  it("parses email with subdomain", () => {
    expect(email().parse("admin@mail.example.co.uk")).toEqual({
      ok: true,
      value: "admin@mail.example.co.uk",
    });
  });

  it("fails on missing @", () => {
    expect(email().parse("notanemail").ok).toBe(false);
  });

  it("fails on missing TLD", () => {
    expect(email().parse("user@localhost").ok).toBe(false);
  });

  it("fails on empty", () => {
    expect(email().parse("").ok).toBe(false);
  });
});

// ─── Enum ─────────────────────────────────────────────────────────────────────

describe("enumValidator()", () => {
  const nodeEnvValidator = enumValidator(["development", "production", "test"] as const);

  it("parses a valid enum value", () => {
    expect(nodeEnvValidator.parse("production")).toEqual({
      ok: true,
      value: "production",
    });
  });

  it("fails on value not in enum", () => {
    expect(nodeEnvValidator.parse("staging").ok).toBe(false);
  });

  it("fails on undefined", () => {
    expect(nodeEnvValidator.parse(undefined).ok).toBe(false);
  });

  it("default() uses fallback", () => {
    expect(
      enumValidator(["development", "production"] as const).default("development").parse(undefined),
    ).toEqual({ ok: true, value: "development" });
  });

  it("values() returns the allowed values", () => {
    expect(nodeEnvValidator.values()).toEqual(["development", "production", "test"]);
  });
});

// ─── CustomValidator ──────────────────────────────────────────────────────────

describe("CustomValidator", () => {
  it("uses custom parse function", () => {
    const hex = new CustomValidator<string>((raw) => {
      if (/^#[0-9a-fA-F]{6}$/.test(raw)) return { ok: true, value: raw };
      return { ok: false, error: `Expected a hex color, got "${raw}"` };
    }, "hex-color");

    expect(hex.parse("#ff0000")).toEqual({ ok: true, value: "#ff0000" });
    expect(hex.parse("red").ok).toBe(false);
    expect(hex.parse(undefined).ok).toBe(false);
  });
});
