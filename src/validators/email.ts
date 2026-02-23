import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

// RFC 5322-compliant email regex (simplified but production-grade)
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export class EmailValidator extends BaseValidator<string> {
  constructor(
    options: {
      required?: boolean;
      defaultValue?: string;
      description?: string;
    } = {},
  ) {
    super("email", options.required ?? true, options.defaultValue, options.description);
  }

  parse(raw: string | undefined): ValidationResult<string> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    if (!EMAIL_REGEX.test(raw)) {
      return {
        ok: false,
        error: `Expected a valid email address, got "${raw}"`,
      };
    }

    return { ok: true, value: raw };
  }
}

export function email(): EmailValidator {
  return new EmailValidator();
}
