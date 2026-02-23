import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

export class NumberValidator extends BaseValidator<number> {
  private readonly _min: number | undefined;
  private readonly _max: number | undefined;
  private readonly _integer: boolean;

  constructor(
    options: {
      min?: number | undefined;
      max?: number | undefined;
      integer?: boolean | undefined;
      required?: boolean | undefined;
      defaultValue?: number | undefined;
      description?: string | undefined;
    } = {},
  ) {
    super("number", options.required ?? true, options.defaultValue, options.description);
    this._min = options.min;
    this._max = options.max;
    this._integer = options.integer ?? false;
  }

  parse(raw: string | undefined): ValidationResult<number> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    const parsed = Number(raw);

    if (isNaN(parsed) || raw.trim() === "") {
      return {
        ok: false,
        error: `Expected a number, got "${raw}"`,
      };
    }

    if (this._integer && !Number.isInteger(parsed)) {
      return {
        ok: false,
        error: `Expected an integer, got "${raw}"`,
      };
    }

    if (this._min !== undefined && parsed < this._min) {
      return {
        ok: false,
        error: `Must be at least ${this._min} (got ${parsed})`,
      };
    }

    if (this._max !== undefined && parsed > this._max) {
      return {
        ok: false,
        error: `Must be at most ${this._max} (got ${parsed})`,
      };
    }

    return { ok: true, value: parsed };
  }

  min(value: number): NumberValidator {
    const opts: ConstructorParameters<typeof NumberValidator>[0] = { min: value, integer: this._integer };
    if (this._max !== undefined) opts.max = this._max;
    if (this._description !== undefined) opts.description = this._description;
    return new NumberValidator(opts);
  }

  max(value: number): NumberValidator {
    const opts: ConstructorParameters<typeof NumberValidator>[0] = { max: value, integer: this._integer };
    if (this._min !== undefined) opts.min = this._min;
    if (this._description !== undefined) opts.description = this._description;
    return new NumberValidator(opts);
  }

  int(): NumberValidator {
    const opts: ConstructorParameters<typeof NumberValidator>[0] = { integer: true };
    if (this._min !== undefined) opts.min = this._min;
    if (this._max !== undefined) opts.max = this._max;
    if (this._description !== undefined) opts.description = this._description;
    return new NumberValidator(opts);
  }

  port(): NumberValidator {
    const opts: ConstructorParameters<typeof NumberValidator>[0] = { min: 1, max: 65535, integer: true };
    if (this._description !== undefined) opts.description = this._description;
    return new NumberValidator(opts);
  }
}

export function number(): NumberValidator {
  return new NumberValidator();
}
