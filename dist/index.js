import pc from 'picocolors';

// src/validators/base.ts
var BaseValidator = class {
  _type;
  _required;
  _default;
  _description;
  constructor(type, required = true, defaultValue = void 0, description = void 0) {
    this._type = type;
    this._required = required;
    this._default = defaultValue;
    this._description = description;
  }
  optional() {
    return new OptionalWrapper(this);
  }
  default(value) {
    return new DefaultWrapper(this, value);
  }
  describe(description) {
    return new DescribedWrapper(this, description);
  }
};
var OptionalWrapper = class extends BaseValidator {
  _inner;
  constructor(inner) {
    super(inner._type, false, void 0, inner._description);
    this._inner = inner;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: true, value: void 0 };
    }
    return this._inner.parse(raw);
  }
};
var DefaultWrapper = class extends BaseValidator {
  _inner;
  _defaultValue;
  constructor(inner, defaultValue) {
    super(inner._type, false, defaultValue, inner._description);
    this._inner = inner;
    this._defaultValue = defaultValue;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: true, value: this._defaultValue };
    }
    return this._inner.parse(raw);
  }
};
var DescribedWrapper = class extends BaseValidator {
  _inner;
  constructor(inner, description) {
    super(inner._type, inner._required, inner._default, description);
    this._inner = inner;
  }
  parse(raw) {
    return this._inner.parse(raw);
  }
};
var CustomValidator = class extends BaseValidator {
  _fn;
  constructor(fn, typeName = "custom") {
    super(typeName, true);
    this._fn = fn;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    return this._fn(raw);
  }
};
function isValidatorMeta(value) {
  return typeof value === "object" && value !== null && "_type" in value && "_required" in value;
}

// src/validators/string.ts
var StringValidator = class _StringValidator extends BaseValidator {
  _minLength;
  _maxLength;
  _pattern;
  constructor(options = {}) {
    super("string", options.required ?? true, options.defaultValue, options.description);
    this._minLength = options.minLength;
    this._maxLength = options.maxLength;
    this._pattern = options.pattern;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    if (this._minLength !== void 0 && raw.length < this._minLength) {
      return {
        ok: false,
        error: `Must be at least ${this._minLength} characters long (got ${raw.length})`
      };
    }
    if (this._maxLength !== void 0 && raw.length > this._maxLength) {
      return {
        ok: false,
        error: `Must be at most ${this._maxLength} characters long (got ${raw.length})`
      };
    }
    if (this._pattern !== void 0 && !this._pattern.test(raw)) {
      return {
        ok: false,
        error: `Must match pattern ${this._pattern.toString()}`
      };
    }
    return { ok: true, value: raw };
  }
  min(length) {
    const opts = { minLength: length };
    if (this._maxLength !== void 0) opts.maxLength = this._maxLength;
    if (this._pattern !== void 0) opts.pattern = this._pattern;
    if (this._description !== void 0) opts.description = this._description;
    return new _StringValidator(opts);
  }
  max(length) {
    const opts = { maxLength: length };
    if (this._minLength !== void 0) opts.minLength = this._minLength;
    if (this._pattern !== void 0) opts.pattern = this._pattern;
    if (this._description !== void 0) opts.description = this._description;
    return new _StringValidator(opts);
  }
  matches(pattern) {
    const opts = { pattern };
    if (this._minLength !== void 0) opts.minLength = this._minLength;
    if (this._maxLength !== void 0) opts.maxLength = this._maxLength;
    if (this._description !== void 0) opts.description = this._description;
    return new _StringValidator(opts);
  }
};
function string() {
  return new StringValidator();
}

// src/validators/number.ts
var NumberValidator = class _NumberValidator extends BaseValidator {
  _min;
  _max;
  _integer;
  constructor(options = {}) {
    super("number", options.required ?? true, options.defaultValue, options.description);
    this._min = options.min;
    this._max = options.max;
    this._integer = options.integer ?? false;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    const parsed = Number(raw);
    if (isNaN(parsed) || raw.trim() === "") {
      return {
        ok: false,
        error: `Expected a number, got "${raw}"`
      };
    }
    if (this._integer && !Number.isInteger(parsed)) {
      return {
        ok: false,
        error: `Expected an integer, got "${raw}"`
      };
    }
    if (this._min !== void 0 && parsed < this._min) {
      return {
        ok: false,
        error: `Must be at least ${this._min} (got ${parsed})`
      };
    }
    if (this._max !== void 0 && parsed > this._max) {
      return {
        ok: false,
        error: `Must be at most ${this._max} (got ${parsed})`
      };
    }
    return { ok: true, value: parsed };
  }
  min(value) {
    const opts = { min: value, integer: this._integer };
    if (this._max !== void 0) opts.max = this._max;
    if (this._description !== void 0) opts.description = this._description;
    return new _NumberValidator(opts);
  }
  max(value) {
    const opts = { max: value, integer: this._integer };
    if (this._min !== void 0) opts.min = this._min;
    if (this._description !== void 0) opts.description = this._description;
    return new _NumberValidator(opts);
  }
  int() {
    const opts = { integer: true };
    if (this._min !== void 0) opts.min = this._min;
    if (this._max !== void 0) opts.max = this._max;
    if (this._description !== void 0) opts.description = this._description;
    return new _NumberValidator(opts);
  }
  port() {
    const opts = { min: 1, max: 65535, integer: true };
    if (this._description !== void 0) opts.description = this._description;
    return new _NumberValidator(opts);
  }
};
function number() {
  return new NumberValidator();
}

// src/validators/boolean.ts
var TRUTHY = /* @__PURE__ */ new Set(["true", "1", "yes", "on"]);
var FALSY = /* @__PURE__ */ new Set(["false", "0", "no", "off"]);
var BooleanValidator = class extends BaseValidator {
  constructor(options = {}) {
    super("boolean", options.required ?? true, options.defaultValue, options.description);
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    const normalized = raw.toLowerCase().trim();
    if (TRUTHY.has(normalized)) return { ok: true, value: true };
    if (FALSY.has(normalized)) return { ok: true, value: false };
    return {
      ok: false,
      error: `Expected a boolean (true/false/1/0/yes/no/on/off), got "${raw}"`
    };
  }
};
function boolean() {
  return new BooleanValidator();
}

// src/validators/url.ts
var UrlValidator = class _UrlValidator extends BaseValidator {
  _protocols;
  constructor(options = {}) {
    super("url", options.required ?? true, options.defaultValue, options.description);
    this._protocols = options.protocols ?? ["http", "https"];
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return {
        ok: false,
        error: `Expected a valid URL, got "${raw}"`
      };
    }
    const protocol = parsed.protocol.replace(":", "");
    if (!this._protocols.includes(protocol)) {
      return {
        ok: false,
        error: `URL protocol must be one of [${this._protocols.join(", ")}], got "${protocol}"`
      };
    }
    return { ok: true, value: raw };
  }
  protocols(...allowed) {
    const opts = { protocols: allowed };
    if (this._description !== void 0) opts.description = this._description;
    return new _UrlValidator(opts);
  }
};
function url() {
  return new UrlValidator();
}

// src/validators/email.ts
var EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
var EmailValidator = class extends BaseValidator {
  constructor(options = {}) {
    super("email", options.required ?? true, options.defaultValue, options.description);
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    if (!EMAIL_REGEX.test(raw)) {
      return {
        ok: false,
        error: `Expected a valid email address, got "${raw}"`
      };
    }
    return { ok: true, value: raw };
  }
};
function email() {
  return new EmailValidator();
}

// src/validators/enum.ts
var EnumValidator = class extends BaseValidator {
  _values;
  constructor(values, options = {}) {
    super(`enum(${values.join(" | ")})`, options.required ?? true, options.defaultValue, options.description);
    this._values = values;
  }
  parse(raw) {
    if (raw === void 0 || raw === "") {
      return { ok: false, error: "Value is required" };
    }
    if (this._values.includes(raw)) {
      return { ok: true, value: raw };
    }
    return {
      ok: false,
      error: `Expected one of [${this._values.map((v) => `"${v}"`).join(", ")}], got "${raw}"`
    };
  }
  values() {
    return this._values;
  }
};
function enumValidator(values) {
  return new EnumValidator(values);
}
var ICONS = {
  missing: "\u2716",
  invalid_type: "\u26A0",
  invalid_format: "\u26A0",
  invalid_value: "\u26A0",
  success: "\u2714",
  error: "\u2716"
};
function formatError(err) {
  const icon = ICONS[err.kind];
  switch (err.kind) {
    case "missing":
      return `  ${pc.red(icon)} ${pc.bold(pc.red(err.key))} ${pc.dim("\u2192")} ${pc.red("missing required variable")}`;
    case "invalid_type":
      return [
        `  ${pc.yellow(icon)} ${pc.bold(pc.yellow(err.key))} ${pc.dim("\u2192")} ${pc.yellow("invalid type")}`,
        err.received !== void 0 ? `    ${pc.dim("received:")}  ${pc.white(err.received)}` : "",
        err.expected !== void 0 ? `    ${pc.dim("expected:")}  ${pc.cyan(err.expected)}` : "",
        `    ${pc.dim("message:")}   ${pc.white(err.message)}`
      ].filter(Boolean).join("\n");
    case "invalid_format":
    case "invalid_value":
      return [
        `  ${pc.yellow(icon)} ${pc.bold(pc.yellow(err.key))} ${pc.dim("\u2192")} ${pc.yellow(err.kind === "invalid_format" ? "invalid format" : "invalid value")}`,
        err.received !== void 0 ? `    ${pc.dim("received:")}  ${pc.white(err.received)}` : "",
        err.expected !== void 0 ? `    ${pc.dim("expected:")}  ${pc.cyan(err.expected)}` : "",
        `    ${pc.dim("message:")}   ${pc.white(err.message)}`
      ].filter(Boolean).join("\n");
  }
}
function formatErrors(errors, source = "env") {
  const lines = [];
  const missing = errors.filter((e) => e.kind === "missing");
  const invalid = errors.filter((e) => e.kind !== "missing");
  lines.push("");
  lines.push(
    pc.bold(pc.red(`  ${ICONS.error} env-guardian: Validation failed`)) + pc.dim(` (${errors.length} error${errors.length !== 1 ? "s" : ""})`)
  );
  lines.push(pc.dim(`  Source: ${source}`));
  lines.push("");
  if (missing.length > 0) {
    lines.push(pc.bold(pc.dim(`  \u2500\u2500 Missing Variables (${missing.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const err of missing) {
      lines.push(formatError(err));
    }
    lines.push("");
  }
  if (invalid.length > 0) {
    lines.push(pc.bold(pc.dim(`  \u2500\u2500 Invalid Variables (${invalid.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const err of invalid) {
      lines.push(formatError(err));
    }
    lines.push("");
  }
  lines.push(pc.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  lines.push(
    pc.dim("  Fix the above errors in your ") + pc.cyan(".env") + pc.dim(" file or environment and restart.")
  );
  lines.push("");
  return lines.join("\n");
}
function formatSuccess(count, source = "env") {
  return [
    "",
    `  ${pc.green(ICONS.success)} ${pc.bold(pc.green("env-guardian: All variables valid"))} ${pc.dim(`(${count} checked)`)}`,
    pc.dim(`  Source: ${source}`),
    ""
  ].join("\n");
}
var EnvValidationError = class extends Error {
  errors;
  constructor(errors, source) {
    super(`Environment validation failed with ${errors.length} error(s)`);
    this.name = "EnvValidationError";
    this.errors = errors;
    this.message = formatErrors(errors, source);
  }
};

// src/schema.ts
function group(shape, options = {}) {
  return {
    _isGroup: true,
    _prefix: options.prefix ?? void 0,
    _envSpecific: options.envSpecific ?? void 0,
    shape
  };
}
function isGroupSchema(value) {
  return typeof value === "object" && value !== null && "_isGroup" in value && value._isGroup === true;
}
function parseFlat(shape, env, prefix, nodeEnv, envSpecific) {
  const errors = [];
  const values = {};
  const mergedShape = { ...shape };
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
      const kind = raw === void 0 || raw === "" ? "missing" : detectErrorKind(result.error);
      errors.push({
        key: envKey,
        kind,
        message: result.error,
        received: raw,
        expected: validator._type
      });
    }
  }
  return { values, errors };
}
function detectErrorKind(message) {
  if (message.toLowerCase().includes("required")) return "missing";
  if (message.toLowerCase().includes("type") || message.toLowerCase().includes("expected a")) {
    return "invalid_type";
  }
  if (message.toLowerCase().includes("url") || message.toLowerCase().includes("email") || message.toLowerCase().includes("pattern")) {
    return "invalid_format";
  }
  return "invalid_value";
}
var EnvGuardian = class {
  _schema;
  _globalEnvSpecific;
  constructor(schema) {
    this._schema = schema;
  }
  /**
   * Add top-level environment-specific overrides.
   * These are applied when the key is directly in the schema (not in a group).
   */
  forEnv(envSpecific) {
    this._globalEnvSpecific = envSpecific;
    return this;
  }
  /**
   * Parse and validate environment variables.
   * Throws `EnvValidationError` on failure.
   */
  parse(options = {}) {
    const env = options.env ?? process.env;
    const nodeEnv = options.nodeEnv ?? process.env["NODE_ENV"];
    const result = {};
    const allErrors = [];
    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        const { values, errors } = parseFlat(
          value.shape,
          env,
          value._prefix ?? "",
          nodeEnv,
          value._envSpecific
        );
        result[key] = values;
        allErrors.push(...errors);
      } else if (isValidatorMeta(value)) {
        const validator = value;
        const raw = env[key];
        const parseResult = validator.parse(raw);
        if (parseResult.ok) {
          if (options.stripTypes) {
            result[key] = parseResult.value;
          } else {
            result[key] = parseResult.value;
          }
        } else {
          const kind = raw === void 0 || raw === "" ? "missing" : detectErrorKind(parseResult.error);
          allErrors.push({
            key,
            kind,
            message: parseResult.error,
            received: raw,
            expected: validator._type
          });
        }
      }
    }
    if (this._globalEnvSpecific && nodeEnv && nodeEnv in this._globalEnvSpecific) {
      const overrides = this._globalEnvSpecific[nodeEnv];
      for (const [key, validator] of Object.entries(overrides)) {
        const raw = env[key];
        const parseResult = validator.parse(raw);
        if (parseResult.ok) {
          result[key] = parseResult.value;
          const idx = allErrors.findIndex((e) => e.key === key);
          if (idx !== -1) allErrors.splice(idx, 1);
        } else {
          const kind = raw === void 0 || raw === "" ? "missing" : detectErrorKind(parseResult.error);
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
              expected: validator._type
            });
          }
        }
      }
    }
    if (allErrors.length > 0) {
      throw new EnvValidationError(allErrors);
    }
    return result;
  }
  /**
   * Validate without throwing. Returns errors array or empty array.
   */
  validate(options = {}) {
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
  generateExample(options = {}) {
    const { comments = true, includeDefaults = true } = options;
    const lines = [];
    if (comments) {
      lines.push("# Generated by env-guardian");
      lines.push("# Fill in the required values before running the application");
      lines.push("");
    }
    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        if (comments) {
          lines.push(`# \u2500\u2500 ${key} \u2500\u2500`);
        }
        for (const [fieldKey, validator] of Object.entries(value.shape)) {
          const envKey = value._prefix ? `${value._prefix}${fieldKey}` : fieldKey;
          lines.push(...formatExampleEntry(envKey, validator, { comments, includeDefaults }));
        }
        lines.push("");
      } else if (isValidatorMeta(value)) {
        lines.push(...formatExampleEntry(key, value, { comments, includeDefaults }));
      }
    }
    return lines.join("\n");
  }
  /**
   * Return a plain object describing the schema (useful for documentation generation).
   */
  introspect() {
    const fields = [];
    for (const [key, value] of Object.entries(this._schema)) {
      if (isGroupSchema(value)) {
        for (const [fieldKey, validator] of Object.entries(value.shape)) {
          const envKey = value._prefix ? `${value._prefix}${fieldKey}` : fieldKey;
          fields.push({
            key: envKey,
            group: key,
            type: validator._type,
            required: validator._required,
            default: validator._default,
            description: validator._description
          });
        }
      } else if (isValidatorMeta(value)) {
        const v = value;
        fields.push({
          key,
          group: void 0,
          type: v._type,
          required: v._required,
          default: v._default,
          description: v._description
        });
      }
    }
    return { fields };
  }
};
function formatExampleEntry(key, validator, options) {
  const lines = [];
  if (options.comments && validator._description) {
    lines.push(`# ${validator._description}`);
  }
  if (options.comments) {
    const meta = [`type: ${validator._type}`];
    if (!validator._required) meta.push("optional");
    if (validator._default !== void 0) meta.push(`default: ${String(validator._default)}`);
    lines.push(`# ${meta.join(" | ")}`);
  }
  const defaultVal = options.includeDefaults && validator._default !== void 0 ? String(validator._default) : "";
  lines.push(`${key}=${defaultVal}`);
  return lines;
}
function defineEnv(schema) {
  return new EnvGuardian(schema);
}
function parseEnv(schema, options) {
  return defineEnv(schema).parse(options);
}
function checkEnv(guard, options = {}) {
  const errors = guard.validate(options);
  const { fields } = guard.introspect();
  if (errors.length > 0) {
    process.stderr.write(formatErrors(errors, options.source ?? "process.env"));
    return false;
  }
  process.stdout.write(formatSuccess(fields.length, options.source ?? "process.env"));
  return true;
}

export { BooleanValidator, CustomValidator, EmailValidator, EnumValidator, EnvValidationError, NumberValidator, StringValidator, UrlValidator, boolean, checkEnv, defineEnv, email, enumValidator, formatErrors, formatSuccess, group, number, parseEnv, string, url };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map