import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

export class UrlValidator extends BaseValidator<string> {
  private readonly _protocols: string[];

  constructor(
    options: {
      protocols?: string[] | undefined;
      required?: boolean | undefined;
      defaultValue?: string | undefined;
      description?: string | undefined;
    } = {},
  ) {
    super("url", options.required ?? true, options.defaultValue, options.description);
    this._protocols = options.protocols ?? ["http", "https"];
  }

  parse(raw: string | undefined): ValidationResult<string> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    let parsed: URL;

    try {
      parsed = new URL(raw);
    } catch {
      return {
        ok: false,
        error: `Expected a valid URL, got "${raw}"`,
      };
    }

    const protocol = parsed.protocol.replace(":", "");
    if (!this._protocols.includes(protocol)) {
      return {
        ok: false,
        error: `URL protocol must be one of [${this._protocols.join(", ")}], got "${protocol}"`,
      };
    }

    if (/\/{2,}/.test(parsed.pathname)) {
      return {
        ok: false,
        error: `URL path must not contain consecutive slashes, got "${raw}"`,
      };
    }

    return { ok: true, value: raw };
  }

  protocols(...allowed: string[]): UrlValidator {
    const opts: ConstructorParameters<typeof UrlValidator>[0] = { protocols: allowed };
    if (this._description !== undefined) opts.description = this._description;
    return new UrlValidator(opts);
  }
}

export function url(): UrlValidator {
  return new UrlValidator();
}
