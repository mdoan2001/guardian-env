import type {
  EnvError,
  FlatSchemaShape,
  GroupSchema,
  InferSchema,
  ParseOptions,
  SchemaShape,
  Validator,
} from "./types.js";
import { isValidatorMeta } from "./validators/index.js";
import { EnvValidationError, formatErrors, formatSuccess } from "./formatter.js";

// ─── Group Builder ────────────────────────────────────────────────────────────

export interface GroupOptions {
  /** Env variable prefix to strip from keys (e.g., "DB_" → key "HOST" reads "DB_HOST") */
  prefix?: string;
  /** Override schema per NODE_ENV value */
  envSpecific?: Record<string, FlatSchemaShape>;
}

export function group<S extends FlatSchemaShape>(
  shape: S,
  options: GroupOptions = {},
): GroupSchema & { shape: S } {
  return {
    _isGroup: true,
    _prefix: options.prefix ?? undefined,
    _envSpecific: options.envSpecific ?? undefined,
    shape,
  };
}

function isGroupSchema(value: unknown): value is GroupSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "_isGroup" in value &&
    (value as GroupSchema)._isGroup === true
  );
}

// ─── Flat Parser ──────────────────────────────────────────────────────────────

function parseFlat(
  shape: FlatSchemaShape,
  env: Record<string, string | undefined>,
  prefix: string,
  nodeEnv: string | undefined,
  envSpecific: Record<string, FlatSchemaShape> | undefined,
): { values: Record<string, unknown>; errors: EnvError[] } {
  const errors: EnvError[] = [];
  const values: Record<string, unknown> = {};

  // Merge env-specific overrides for the current NODE_ENV
  const mergedShape: FlatSchemaShape = { ...shape };
  if (envSpecific && nodeEnv && nodeEnv in envSpecific) {
    Object.assign(mergedShape, envSpecific[nodeEnv]);
  }

  for (const [key, validator] of Object.entries(mergedShape)) {
    const envKey = prefix ? `${prefix}${key}` : key;
    const raw = env[envKey];
    const result = validator.parse(raw);

    if (result.ok) {
      values[key] = result.value;
    } else {
      const kind = raw === undefined || raw === "" ? "missing" : detectErrorKind(result.error);
      errors.push({
        key: envKey,
        kind,
        message: result.error,
        received: raw,
        expected: validator._type,
      });
    }
  }

  return { values, errors };
}

function detectErrorKind(message: string): EnvError["kind"] {
  if (message.toLowerCase().includes("required")) return "missing";
  if (message.toLowerCase().includes("type") || message.toLowerCase().includes("expected a")) {
    return "invalid_type";
  }
  if (
    message.toLowerCase().includes("url") ||
    message.toLowerCase().includes("email") ||
    message.toLowerCase().includes("pattern")
  ) {
    return "invalid_format";
  }
  return "invalid_value";
}

// ─── EnvGuardian ─────────────────────────────────────────────────────────────

export class EnvGuardian<S extends SchemaShape> {
  private readonly _schema: S;
  private _globalEnvSpecific: Record<string, FlatSchemaShape> | undefined;

  constructor(schema: S) {
    this._schema = schema;
  }

  /**
   * Add top-level environment-specific overrides.
   * These are applied when the key is directly in the schema (not in a group).
   */
  forEnv(envSpecific: Record<string, FlatSchemaShape>): this {
    this._globalEnvSpecific = envSpecific;
    return this;
  }

  /**
   * Parse and validate environment variables.
   * Throws `EnvValidationError` on failure.
   */
  parse(options: ParseOptions = {}): InferSchema<S> {
    const env = options.env ?? (process.env as Record<string, string | undefined>);
    const nodeEnv = options.nodeEnv ?? process.env["NODE_ENV"];
    const result: Record<string, unknown> = {};
    const allErrors: EnvError[] = [];

    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        const { values, errors } = parseFlat(
          value.shape,
          env,
          value._prefix ?? "",
          nodeEnv,
          value._envSpecific,
        );
        result[key] = values;
        allErrors.push(...errors);
      } else if (isValidatorMeta(value)) {
        const validator = value as Validator<unknown>;
        const raw = env[key];
        const parseResult = validator.parse(raw);

        if (parseResult.ok) {
          // Strip type metadata in production if requested
          if (options.stripTypes) {
            result[key] = parseResult.value;
          } else {
            result[key] = parseResult.value;
          }
        } else {
          const kind = raw === undefined || raw === "" ? "missing" : detectErrorKind(parseResult.error);
          allErrors.push({
            key,
            kind,
            message: parseResult.error,
            received: raw,
            expected: validator._type,
          });
        }
      }
    }

    // Apply global env-specific overrides for flat keys
    if (this._globalEnvSpecific && nodeEnv && nodeEnv in this._globalEnvSpecific) {
      const overrides = this._globalEnvSpecific[nodeEnv]!;
      for (const [key, validator] of Object.entries(overrides)) {
        const raw = env[key];
        const parseResult = validator.parse(raw);

        if (parseResult.ok) {
          result[key] = parseResult.value;
          // Remove prior error for this key if any
          const idx = allErrors.findIndex((e) => e.key === key);
          if (idx !== -1) allErrors.splice(idx, 1);
        } else {
          const kind = raw === undefined || raw === "" ? "missing" : detectErrorKind(parseResult.error);
          const existing = allErrors.find((e) => e.key === key);
          if (existing) {
            existing.kind = kind;
            existing.message = parseResult.error;
            existing.received = raw;
            existing.expected = validator._type;
          } else {
            allErrors.push({
              key,
              kind,
              message: parseResult.error,
              received: raw,
              expected: validator._type,
            });
          }
        }
      }
    }

    if (allErrors.length > 0) {
      throw new EnvValidationError(allErrors);
    }

    return result as InferSchema<S>;
  }

  /**
   * Validate without throwing. Returns errors array or empty array.
   */
  validate(options: ParseOptions = {}): EnvError[] {
    try {
      this.parse(options);
      return [];
    } catch (err) {
      if (err instanceof EnvValidationError) {
        return err.errors;
      }
      throw err;
    }
  }

  /**
   * Generate a .env.example file content from the schema.
   */
  generateExample(
    options: {
      comments?: boolean;
      includeDefaults?: boolean;
    } = {},
  ): string {
    const { comments = true, includeDefaults = true } = options;
    const lines: string[] = [];

    if (comments) {
      lines.push("# Generated by env-guardian");
      lines.push("# Fill in the required values before running the application");
      lines.push("");
    }

    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        if (comments) {
          lines.push(`# ── ${key} ──`);
        }
        for (const [fieldKey, validator] of Object.entries(value.shape)) {
          const envKey = value._prefix ? `${value._prefix}${fieldKey}` : fieldKey;
          lines.push(...formatExampleEntry(envKey, validator as Validator<unknown>, { comments, includeDefaults }));
        }
        lines.push("");
      } else if (isValidatorMeta(value)) {
        lines.push(...formatExampleEntry(key, value as Validator<unknown>, { comments, includeDefaults }));
      }
    }

    return lines.join("\n");
  }

  /**
   * Return a plain object describing the schema (useful for documentation generation).
   */
  introspect(): SchemaIntrospection {
    const fields: IntrospectedField[] = [];

    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        for (const [fieldKey, validator] of Object.entries(value.shape)) {
          const envKey = value._prefix ? `${value._prefix}${fieldKey}` : fieldKey;
          fields.push({
            key: envKey,
            group: key,
            type: (validator as Validator<unknown>)._type,
            required: (validator as Validator<unknown>)._required,
            default: (validator as Validator<unknown>)._default,
            description: (validator as Validator<unknown>)._description,
          });
        }
      } else if (isValidatorMeta(value)) {
        const v = value as Validator<unknown>;
        fields.push({
          key,
          group: undefined,
          type: v._type,
          required: v._required,
          default: v._default,
          description: v._description,
        });
      }
    }

    return { fields };
  }
}

// ─── Introspection Types ──────────────────────────────────────────────────────

export interface IntrospectedField {
  key: string;
  group: string | undefined;
  type: string;
  required: boolean;
  default: unknown;
  description: string | undefined;
}

export interface SchemaIntrospection {
  fields: IntrospectedField[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExampleEntry(
  key: string,
  validator: Validator<unknown>,
  options: { comments: boolean; includeDefaults: boolean },
): string[] {
  const lines: string[] = [];

  if (options.comments && validator._description) {
    lines.push(`# ${validator._description}`);
  }

  if (options.comments) {
    const meta: string[] = [`type: ${validator._type}`];
    if (!validator._required) meta.push("optional");
    if (validator._default !== undefined) meta.push(`default: ${String(validator._default)}`);
    lines.push(`# ${meta.join(" | ")}`);
  }

  const defaultVal =
    options.includeDefaults && validator._default !== undefined
      ? String(validator._default)
      : "";

  lines.push(`${key}=${defaultVal}`);
  return lines;
}

// ─── Top-level API ────────────────────────────────────────────────────────────

/**
 * Define an environment variable schema.
 *
 * @example
 * const env = defineEnv({
 *   PORT: number().default(3000),
 *   DATABASE_URL: url(),
 *   NODE_ENV: enumValidator(["development", "production"]),
 * });
 *
 * export const config = env.parse();
 */
export function defineEnv<S extends SchemaShape>(schema: S): EnvGuardian<S> {
  return new EnvGuardian(schema);
}

/**
 * Quick one-shot parse — define schema and parse immediately.
 * Equivalent to `defineEnv(schema).parse(options)`.
 */
export function parseEnv<S extends SchemaShape>(
  schema: S,
  options?: ParseOptions,
): InferSchema<S> {
  return defineEnv(schema).parse(options);
}

/**
 * Print formatted validation errors to stderr.
 * Returns true if all valid, false if errors found.
 */
export function checkEnv<S extends SchemaShape>(
  guard: EnvGuardian<S>,
  options: ParseOptions & { source?: string } = {},
): boolean {
  const errors = guard.validate(options);
  const { fields } = guard.introspect();

  if (errors.length > 0) {
    process.stderr.write(formatErrors(errors, options.source ?? "process.env"));
    return false;
  }

  process.stdout.write(formatSuccess(fields.length, options.source ?? "process.env"));
  return true;
}
