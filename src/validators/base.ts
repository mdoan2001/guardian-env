import type { ValidationResult, Validator, ValidatorMeta } from "../types.js";

export abstract class BaseValidator<T> implements Validator<T> {
  readonly _type: string;
  readonly _required: boolean;
  readonly _default: unknown;
  readonly _description: string | undefined;

  constructor(
    type: string,
    required = true,
    defaultValue: unknown = undefined,
    description: string | undefined = undefined,
  ) {
    this._type = type;
    this._required = required;
    this._default = defaultValue;
    this._description = description;
  }

  abstract parse(raw: string | undefined): ValidationResult<T>;

  optional(): Validator<T | undefined> {
    return new OptionalWrapper<T>(this);
  }

  default(value: T): Validator<T> {
    return new DefaultWrapper<T>(this, value);
  }

  describe(description: string): Validator<T> {
    return new DescribedWrapper<T>(this, description);
  }
}

// ─── Optional Wrapper ─────────────────────────────────────────────────────────

class OptionalWrapper<T> extends BaseValidator<T | undefined> {
  private readonly _inner: Validator<T>;

  constructor(inner: Validator<T>) {
    super(inner._type, false, undefined, inner._description);
    this._inner = inner;
  }

  parse(raw: string | undefined): ValidationResult<T | undefined> {
    if (raw === undefined || raw === "") {
      return { ok: true, value: undefined };
    }
    return this._inner.parse(raw);
  }
}

// ─── Default Wrapper ──────────────────────────────────────────────────────────

class DefaultWrapper<T> extends BaseValidator<T> {
  private readonly _inner: Validator<T>;
  private readonly _defaultValue: T;

  constructor(inner: Validator<T>, defaultValue: T) {
    super(inner._type, false, defaultValue, inner._description);
    this._inner = inner;
    this._defaultValue = defaultValue;
  }

  parse(raw: string | undefined): ValidationResult<T> {
    if (raw === undefined || raw === "") {
      return { ok: true, value: this._defaultValue };
    }
    return this._inner.parse(raw);
  }
}

// ─── Described Wrapper ────────────────────────────────────────────────────────

class DescribedWrapper<T> extends BaseValidator<T> {
  private readonly _inner: Validator<T>;

  constructor(inner: Validator<T>, description: string) {
    super(inner._type, inner._required, inner._default, description);
    this._inner = inner;
  }

  parse(raw: string | undefined): ValidationResult<T> {
    return this._inner.parse(raw);
  }
}

// ─── Custom Validator ─────────────────────────────────────────────────────────

export class CustomValidator<T> extends BaseValidator<T> {
  private readonly _fn: (raw: string) => ValidationResult<T>;

  constructor(
    fn: (raw: string) => ValidationResult<T>,
    typeName = "custom",
  ) {
    super(typeName, true);
    this._fn = fn;
  }

  parse(raw: string | undefined): ValidationResult<T> {
    if (raw === undefined || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    return this._fn(raw);
  }
}

export function isValidatorMeta(value: unknown): value is ValidatorMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    "_type" in value &&
    "_required" in value
  );
}
