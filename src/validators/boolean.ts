import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

const TRUTHY = new Set(["true", "1", "yes", "on"]);
const FALSY = new Set(["false", "0", "no", "off"]);

export class BooleanValidator extends BaseValidator<boolean> {
  constructor(
    options: {
      required?: boolean;
      defaultValue?: boolean;
      description?: string;
    } = {},
  ) {
    super("boolean", options.required ?? true, options.defaultValue, options.description);
  }

  parse(raw: string | undefined): ValidationResult<boolean> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    const normalized = raw.toLowerCase().trim();

    if (TRUTHY.has(normalized)) return { ok: true, value: true };
    if (FALSY.has(normalized)) return { ok: true, value: false };

    return {
      ok: false,
      error: `Expected a boolean (true/false/1/0/yes/no/on/off), got "${raw}"`,
    };
  }
}

export function boolean(): BooleanValidator {
  return new BooleanValidator();
}
