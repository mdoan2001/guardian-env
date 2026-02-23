import type { ValidationResult } from "../types.js";
import { BaseValidator } from "./base.js";

export class StringValidator extends BaseValidator<string> {
  private readonly _minLength: number | undefined;
  private readonly _maxLength: number | undefined;
  private readonly _pattern: RegExp | undefined;

  constructor(
    options: {
      minLength?: number | undefined;
      maxLength?: number | undefined;
      pattern?: RegExp | undefined;
      required?: boolean | undefined;
      defaultValue?: string | undefined;
      description?: string | undefined;
    } = {},
  ) {
    super("string", options.required ?? true, options.defaultValue, options.description);
    this._minLength = options.minLength;
    this._maxLength = options.maxLength;
    this._pattern = options.pattern;
  }

  parse(raw: string | undefined): ValidationResult<string> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }

    if (this._minLength !== undefined && raw.length < this._minLength) {
      return {
        ok: false,
        error: `Must be at least ${this._minLength} characters long (got ${raw.length})`,
      };
    }

    if (this._maxLength !== undefined && raw.length > this._maxLength) {
      return {
        ok: false,
        error: `Must be at most ${this._maxLength} characters long (got ${raw.length})`,
      };
    }

    if (this._pattern !== undefined && !this._pattern.test(raw)) {
      return {
        ok: false,
        error: `Must match pattern ${this._pattern.toString()}`,
      };
    }

    return { ok: true, value: raw };
  }

  min(length: number): StringValidator {
    const opts: ConstructorParameters<typeof StringValidator>[0] = { minLength: length };
    if (this._maxLength !== undefined) opts.maxLength = this._maxLength;
    if (this._pattern !== undefined) opts.pattern = this._pattern;
    if (this._description !== undefined) opts.description = this._description;
    return new StringValidator(opts);
  }

  max(length: number): StringValidator {
    const opts: ConstructorParameters<typeof StringValidator>[0] = { maxLength: length };
    if (this._minLength !== undefined) opts.minLength = this._minLength;
    if (this._pattern !== undefined) opts.pattern = this._pattern;
    if (this._description !== undefined) opts.description = this._description;
    return new StringValidator(opts);
  }

  matches(pattern: RegExp): StringValidator {
    const opts: ConstructorParameters<typeof StringValidator>[0] = { pattern };
    if (this._minLength !== undefined) opts.minLength = this._minLength;
    if (this._maxLength !== undefined) opts.maxLength = this._maxLength;
    if (this._description !== undefined) opts.description = this._description;
    return new StringValidator(opts);
  }
}

export function string(): StringValidator {
  return new StringValidator();
}
