import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

export class EnumValidator<T extends string> extends BaseValidator<T> {
  private readonly _values: readonly T[];

  constructor(
    values: readonly T[],
    options: {
      required?: boolean;
      defaultValue?: T;
      description?: string;
    } = {},
  ) {
    super(`enum(${values.join(" | ")})`, options.required ?? true, options.defaultValue, options.description);
    this._values = values;
  }

  parse(raw: string | undefined): ValidationResult<T> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    if (this._values.includes(raw as T)) {
      return { ok: true, value: raw as T };
    }

    return {
      ok: false,
      error: `Expected one of [${this._values.map((v) => `"${v}"`).join(", ")}], got "${raw}"`,
    };
  }

  values(): readonly T[] {
    return this._values;
  }
}

export function enumValidator<T extends string>(values: readonly T[]): EnumValidator<T> {
  return new EnumValidator<T>(values);
}
