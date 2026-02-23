// ─── Core API ─────────────────────────────────────────────────────────────────
export { defineEnv, parseEnv, checkEnv, group } from "./schema.js";
export type { EnvGuardian, GroupOptions, SchemaIntrospection, IntrospectedField } from "./schema.js";

// ─── Validators ───────────────────────────────────────────────────────────────
export { string, StringValidator } from "./validators/string.js";
export { number, NumberValidator } from "./validators/number.js";
export { boolean, BooleanValidator } from "./validators/boolean.js";
export { url, UrlValidator } from "./validators/url.js";
export { email, EmailValidator } from "./validators/email.js";
export { enumValidator, EnumValidator } from "./validators/enum.js";
export { CustomValidator } from "./validators/base.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  Validator,
  ValidatorMeta,
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  SchemaShape,
  FlatSchemaShape,
  GroupSchema,
  InferSchema,
  InferValidator,
  InferFlat,
  EnvError,
  ErrorKind,
  ParseOptions,
} from "./types.js";

// ─── Errors ───────────────────────────────────────────────────────────────────
export { EnvValidationError } from "./formatter.js";

// ─── Re-export formatters for advanced usage ──────────────────────────────────
export { formatErrors, formatSuccess } from "./formatter.js";
