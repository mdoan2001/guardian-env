// ─── Validation Result ────────────────────────────────────────────────────────

export type ValidationSuccess<T> = { ok: true; value: T };
export type ValidationFailure = { ok: false; error: string };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ─── Validator Shape ──────────────────────────────────────────────────────────

export interface ValidatorMeta {
  readonly _type: string;
  readonly _required: boolean;
  readonly _default: unknown;
  readonly _description: string | undefined;
}

export interface Validator<T> extends ValidatorMeta {
  parse(raw: string | undefined): ValidationResult<T>;
  optional(): Validator<T | undefined>;
  default(value: T): Validator<T>;
  describe(description: string): Validator<T>;
}

// ─── Schema Types ─────────────────────────────────────────────────────────────

export type FlatSchemaShape = Record<string, Validator<unknown>>;

export interface GroupSchema {
  readonly _isGroup: true;
  readonly _prefix: string | undefined;
  readonly _envSpecific: EnvSpecificSchema | undefined;
  readonly shape: FlatSchemaShape;
}

export type SchemaShape = Record<string, Validator<unknown> | GroupSchema>;

export type EnvSpecificSchema = Record<string, FlatSchemaShape>;

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type InferValidator<V> = V extends Validator<infer T> ? T : never;

export type InferFlat<S extends FlatSchemaShape> = {
  [K in keyof S]: InferValidator<S[K]>;
};

export type InferGroup<G extends GroupSchema> = InferFlat<G["shape"]>;

export type InferSchema<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends GroupSchema
    ? InferGroup<S[K]>
    : S[K] extends Validator<unknown>
      ? InferValidator<S[K]>
      : never;
};

// ─── Error Types ──────────────────────────────────────────────────────────────

export type ErrorKind = "missing" | "invalid_type" | "invalid_format" | "invalid_value";

export interface EnvError {
  key: string;
  kind: ErrorKind;
  message: string;
  received: string | undefined;
  expected: string | undefined;
}

// ─── Parse Options ────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Override the env source (default: process.env) */
  env?: Record<string, string | undefined>;
  /** Current environment name (for env-specific schemas) */
  nodeEnv?: string | undefined;
  /** Strip type metadata at runtime (production optimization) */
  stripTypes?: boolean | undefined;
  /** Exit process on validation error (default: true in CLI mode) */
  exitOnError?: boolean | undefined;
}
