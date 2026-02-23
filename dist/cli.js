#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, basename, join, extname } from 'path';
import pc2 from 'picocolors';

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
      return `  ${pc2.red(icon)} ${pc2.bold(pc2.red(err.key))} ${pc2.dim("\u2192")} ${pc2.red("missing required variable")}`;
    case "invalid_type":
      return [
        `  ${pc2.yellow(icon)} ${pc2.bold(pc2.yellow(err.key))} ${pc2.dim("\u2192")} ${pc2.yellow("invalid type")}`,
        err.received !== void 0 ? `    ${pc2.dim("received:")}  ${pc2.white(err.received)}` : "",
        err.expected !== void 0 ? `    ${pc2.dim("expected:")}  ${pc2.cyan(err.expected)}` : "",
        `    ${pc2.dim("message:")}   ${pc2.white(err.message)}`
      ].filter(Boolean).join("\n");
    case "invalid_format":
    case "invalid_value":
      return [
        `  ${pc2.yellow(icon)} ${pc2.bold(pc2.yellow(err.key))} ${pc2.dim("\u2192")} ${pc2.yellow(err.kind === "invalid_format" ? "invalid format" : "invalid value")}`,
        err.received !== void 0 ? `    ${pc2.dim("received:")}  ${pc2.white(err.received)}` : "",
        err.expected !== void 0 ? `    ${pc2.dim("expected:")}  ${pc2.cyan(err.expected)}` : "",
        `    ${pc2.dim("message:")}   ${pc2.white(err.message)}`
      ].filter(Boolean).join("\n");
  }
}
function formatErrors(errors, source = "env") {
  const lines = [];
  const missing = errors.filter((e) => e.kind === "missing");
  const invalid = errors.filter((e) => e.kind !== "missing");
  lines.push("");
  lines.push(
    pc2.bold(pc2.red(`  ${ICONS.error} env-guardian: Validation failed`)) + pc2.dim(` (${errors.length} error${errors.length !== 1 ? "s" : ""})`)
  );
  lines.push(pc2.dim(`  Source: ${source}`));
  lines.push("");
  if (missing.length > 0) {
    lines.push(pc2.bold(pc2.dim(`  \u2500\u2500 Missing Variables (${missing.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const err of missing) {
      lines.push(formatError(err));
    }
    lines.push("");
  }
  if (invalid.length > 0) {
    lines.push(pc2.bold(pc2.dim(`  \u2500\u2500 Invalid Variables (${invalid.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const err of invalid) {
      lines.push(formatError(err));
    }
    lines.push("");
  }
  lines.push(pc2.dim("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  lines.push(
    pc2.dim("  Fix the above errors in your ") + pc2.cyan(".env") + pc2.dim(" file or environment and restart.")
  );
  lines.push("");
  return lines.join("\n");
}
function formatSuccess(count, source = "env") {
  return [
    "",
    `  ${pc2.green(ICONS.success)} ${pc2.bold(pc2.green("env-guardian: All variables valid"))} ${pc2.dim(`(${count} checked)`)}`,
    pc2.dim(`  Source: ${source}`),
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

// src/cli.ts
function parseDotEnv(content) {
  const result = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}
var SOURCE_EXTS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".svelte", ".vue"]);
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "coverage", ".turbo"]);
var ENV_KEY_REGEX = /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g;
var DESTRUCTURE_REGEX = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:process\.env|import\.meta\.env)/g;
function scanSourceFiles(cwd) {
  const found = /* @__PURE__ */ new Set();
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (SOURCE_EXTS.has(extname(entry))) {
        try {
          const content = readFileSync(full, "utf8");
          for (const match of content.matchAll(ENV_KEY_REGEX)) {
            if (match[1]) found.add(match[1]);
          }
          for (const match of content.matchAll(DESTRUCTURE_REGEX)) {
            if (!match[1]) continue;
            for (const part of match[1].split(",")) {
              const key = part.trim().split(/\s*:\s*/)[0]?.trim();
              if (key && /^[A-Z][A-Z0-9_]*$/.test(key)) found.add(key);
            }
          }
        } catch {
        }
      }
    }
  }
  walk(cwd);
  return found;
}
function detectType(value) {
  if (value === "true" || value === "false") return "boolean";
  if (value !== "" && !isNaN(Number(value))) return "number";
  try {
    const u = new URL(value);
    if (u.protocol === "http:" || u.protocol === "https:") return "url";
  } catch {
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  return "string";
}
function inferSchemaFromEnv(env) {
  const schema = {};
  for (const [key, value] of Object.entries(env)) {
    const type = detectType(value);
    switch (type) {
      case "boolean":
        schema[key] = boolean().optional();
        break;
      case "number":
        schema[key] = number().optional();
        break;
      case "url":
        schema[key] = url().optional();
        break;
      case "email":
        schema[key] = email().optional();
        break;
      default:
        schema[key] = string().optional();
        break;
    }
  }
  return schema;
}
function loadProjectConfig(cwd) {
  const pkgPath = resolve(cwd, "package.json");
  const defaults = { ignore: [], src: void 0 };
  if (!existsSync(pkgPath)) return defaults;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const cfg = pkg["guardian-env"];
    if (!cfg || typeof cfg !== "object") return defaults;
    const raw = cfg;
    return {
      ignore: Array.isArray(raw["ignore"]) ? raw["ignore"].filter((v) => typeof v === "string") : [],
      src: typeof raw["src"] === "string" ? raw["src"] : void 0
    };
  } catch {
    return defaults;
  }
}
var SCHEMA_SEARCH_PATHS = [
  "guardian-env.config.ts",
  "guardian-env.config.js",
  "guardian-env.config.mjs",
  "env.schema.ts",
  "env.schema.js",
  "env.schema.mjs",
  "env.config.ts",
  "env.config.js"
];
async function loadSchemaFile(schemaPath) {
  if (!existsSync(schemaPath)) return null;
  try {
    const mod = await import(schemaPath);
    const schema = mod.default ?? mod.schema;
    if (typeof schema !== "object" || schema === null) return null;
    return schema;
  } catch {
    return null;
  }
}
async function findSchema(explicitPath, cwd) {
  const searchPaths = explicitPath ? [resolve(cwd, explicitPath)] : SCHEMA_SEARCH_PATHS.map((p) => resolve(cwd, p));
  for (const schemaPath of searchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (loaded) return { schema: loaded, schemaFile: basename(schemaPath) };
  }
  return null;
}
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: "check",
    envFile: ".env",
    schemaFile: "",
    outputFile: ".env.example",
    noComments: false,
    nodeEnv: void 0,
    strict: false
  };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) {
      i++;
      continue;
    }
    if (!arg.startsWith("--")) {
      result.command = arg;
    } else if (arg === "--env" && args[i + 1]) {
      result.envFile = args[++i] ?? result.envFile;
    } else if (arg === "--schema" && args[i + 1]) {
      result.schemaFile = args[++i] ?? result.schemaFile;
    } else if (arg === "--output" && args[i + 1]) {
      result.outputFile = args[++i] ?? result.outputFile;
    } else if (arg === "--no-comments") {
      result.noComments = true;
    } else if (arg === "--strict") {
      result.strict = true;
    } else if (arg === "--node-env" && args[i + 1]) {
      const next = args[++i];
      if (next !== void 0) result.nodeEnv = next;
    }
    i++;
  }
  return result;
}
async function commandCheck(args) {
  const cwd = process.cwd();
  const projectConfig = loadProjectConfig(cwd);
  const ignoreSet = new Set(projectConfig.ignore);
  const envPath = resolve(cwd, args.envFile);
  if (!existsSync(envPath)) {
    console.error([
      "",
      `  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("No .env file found"))} at ${pc2.cyan(args.envFile)}`,
      "",
      `  ${pc2.dim("Create a")} ${pc2.cyan(".env")} ${pc2.dim("file first:")}`,
      `  ${pc2.dim("  echo 'PORT=3000' > .env")}`,
      ""
    ].join("\n"));
    process.exit(1);
  }
  const envContent = readFileSync(envPath, "utf8");
  const envVars = parseDotEnv(envContent);
  const source = basename(envPath);
  const keyCount = Object.keys(envVars).length;
  if (keyCount === 0) {
    console.log([
      "",
      `  ${pc2.yellow("\u26A0")} ${pc2.bold(pc2.yellow(args.envFile + " is empty"))}`,
      `  ${pc2.dim("Add some environment variables and run again.")}`,
      ""
    ].join("\n"));
    return;
  }
  const found = await findSchema(args.schemaFile, cwd);
  if (found) {
    const guardian = "validate" in found.schema && typeof found.schema.validate === "function" ? found.schema : Object.assign(defineEnv(found.schema), {});
    const validateFn = "validate" in guardian ? (opts) => guardian.validate(opts) : (opts) => defineEnv(found.schema).validate(opts);
    const parseOpts = args.nodeEnv !== void 0 ? { env: envVars, nodeEnv: args.nodeEnv } : { env: envVars };
    const errors = validateFn(parseOpts);
    console.log(`
  ${pc2.dim("Schema:")} ${pc2.cyan(found.schemaFile)}`);
    if (errors.length > 0) {
      process.stderr.write(formatErrors(errors, source));
      process.exit(1);
    }
    process.stdout.write(formatSuccess(keyCount, source));
    return;
  }
  const scanRoot = projectConfig.src ? resolve(cwd, projectConfig.src) : cwd;
  const rawScannedKeys = scanSourceFiles(scanRoot);
  const scannedKeys = /* @__PURE__ */ new Set();
  for (const k of rawScannedKeys) {
    if (!ignoreSet.has(k)) scannedKeys.add(k);
  }
  const examplePath = resolve(cwd, ".env.example");
  const exampleVars = existsSync(examplePath) ? parseDotEnv(readFileSync(examplePath, "utf8")) : null;
  const expectedKeys = /* @__PURE__ */ new Set();
  let referenceSource = "";
  if (scannedKeys.size > 0) {
    for (const k of scannedKeys) expectedKeys.add(k);
    referenceSource = `source code (${scannedKeys.size} keys found)`;
  }
  if (exampleVars) {
    for (const k of Object.keys(exampleVars)) {
      if (!ignoreSet.has(k)) expectedKeys.add(k);
    }
    referenceSource = scannedKeys.size > 0 ? `source code + .env.example` : `.env.example`;
  }
  const missingKeys = expectedKeys.size > 0 ? [...expectedKeys].filter((k) => !(k in envVars)) : [];
  const unusedKeys = scannedKeys.size > 0 ? Object.keys(envVars).filter((k) => !scannedKeys.has(k) && !(exampleVars && k in exampleVars)) : [];
  console.log([
    "",
    `  ${pc2.bold(pc2.cyan("guardian-env"))} ${pc2.dim("\u2014 auto mode")}`,
    referenceSource ? `  ${pc2.dim("Reference:")} ${pc2.cyan(referenceSource)}` : `  ${pc2.dim("No reference found. Add")} ${pc2.cyan(".env.example")} ${pc2.dim("or use")} ${pc2.cyan("process.env.KEY")} ${pc2.dim("in your source code.")}`,
    ignoreSet.size > 0 ? `  ${pc2.dim(`Ignoring: ${[...ignoreSet].join(", ")}`)}` : "",
    ""
  ].filter(Boolean).join("\n"));
  if (missingKeys.length > 0) {
    console.log(pc2.bold(pc2.dim(`  \u2500\u2500 Missing Variables (${missingKeys.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const key of missingKeys) {
      console.log(`  ${pc2.red("\u2716")} ${pc2.bold(pc2.red(key))} ${pc2.dim("\u2192")} ${pc2.red("used in code but not set in .env")}`);
    }
    console.log("");
  }
  const inferredSchema = inferSchemaFromEnv(envVars);
  const rows = [];
  for (const [key, value] of Object.entries(envVars)) {
    const type = detectType(value);
    const validator = inferredSchema[key];
    if (!validator) continue;
    const result = validator.parse(value);
    rows.push({ key, value, type, ok: result.ok });
  }
  const maxKeyLen = Math.max(...rows.map((r) => r.key.length), 10);
  const colKey = maxKeyLen + 2;
  console.log(
    `  ${pc2.bold(pc2.dim("KEY".padEnd(colKey)))}${pc2.bold(pc2.dim("TYPE".padEnd(12)))}${pc2.bold(pc2.dim("VALUE"))}`
  );
  console.log(`  ${pc2.dim("\u2500".repeat(60))}`);
  let hasInvalid = false;
  for (const row of rows) {
    const key = row.key.padEnd(colKey);
    const type = pc2.dim(row.type.padEnd(12));
    const val = row.value.length > 40 ? row.value.slice(0, 37) + "..." : row.value;
    const displayVal = row.ok ? pc2.white(val) : pc2.red(val);
    const status = row.ok ? "" : ` ${pc2.red("\u2716 invalid " + row.type)}`;
    console.log(`  ${pc2.bold(key)}${type}${displayVal}${status}`);
    if (!row.ok) hasInvalid = true;
  }
  console.log(`  ${pc2.dim("\u2500".repeat(60))}`);
  if (unusedKeys.length > 0) {
    console.log("");
    console.log(pc2.bold(pc2.dim(`  \u2500\u2500 Unused Variables (${unusedKeys.length}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`)));
    for (const key of unusedKeys) {
      console.log(`  ${pc2.dim("\xB7")} ${pc2.dim(key)} ${pc2.dim("\u2192 in .env but not found in source code")}`);
    }
  }
  const hasMissing = missingKeys.length > 0;
  const invalidCount = rows.filter((r) => !r.ok).length;
  if (hasMissing || hasInvalid && args.strict) {
    const reasons = [];
    if (hasMissing) reasons.push(`${missingKeys.length} missing`);
    if (hasInvalid && args.strict) reasons.push(`${invalidCount} invalid`);
    console.log([
      "",
      `  ${pc2.red("\u2716")} ${pc2.bold(pc2.red(`Validation failed`))} ${pc2.dim(`(${reasons.join(", ")})`)}`,
      hasMissing ? `  ${pc2.dim("Add the missing variables to your")} ${pc2.cyan(source)} ${pc2.dim("file.")}` : `  ${pc2.dim("Fix the invalid values in your")} ${pc2.cyan(source)} ${pc2.dim("file.")}`,
      ""
    ].join("\n"));
    process.exit(1);
  }
  if (invalidCount > 0) {
    console.log([
      "",
      `  ${pc2.yellow("\u26A0")} ${pc2.bold(pc2.yellow(`${invalidCount} value(s) look malformed`))} ${pc2.dim(`out of ${rows.length}`)}`,
      `  ${pc2.dim("Run")} ${pc2.cyan("npx guardian-env init")} ${pc2.dim("to create a schema and validate strictly.")}`,
      ""
    ].join("\n"));
  } else {
    console.log([
      "",
      `  ${pc2.green("\u2714")} ${pc2.bold(pc2.green(`All ${rows.length} variables look good`))} ${pc2.dim(`(inferred from ${source})`)}`,
      !exampleVars ? `  ${pc2.dim("Run")} ${pc2.cyan("npx guardian-env init")} ${pc2.dim("to add strict validation with types.")}` : "",
      ""
    ].filter(Boolean).join("\n"));
  }
}
async function commandInit(args) {
  const cwd = process.cwd();
  const envPath = resolve(cwd, args.envFile);
  const outputFile = "guardian-env.config.ts";
  const outputPath = resolve(cwd, outputFile);
  if (existsSync(outputPath)) {
    console.log([
      "",
      `  ${pc2.yellow("\u26A0")} ${pc2.bold(pc2.yellow(outputFile + " already exists"))}`,
      `  ${pc2.dim("Delete it first or edit it manually.")}`,
      ""
    ].join("\n"));
    return;
  }
  let lines = [];
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    const envVars = parseDotEnv(envContent);
    lines = generateConfigFromEnv(envVars, args.envFile);
    writeFileSync(outputPath, lines.join("\n"), "utf8");
    console.log([
      "",
      `  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Created"))} ${pc2.cyan(outputFile)}`,
      `  ${pc2.dim(`Generated from ${args.envFile} with ${Object.keys(envVars).length} variables`)}`,
      "",
      `  ${pc2.bold("Next steps:")}`,
      `  ${pc2.dim("1.")} Review ${pc2.cyan(outputFile)} ${pc2.dim("and adjust validators as needed")}`,
      `  ${pc2.dim("2.")} Import in your app: ${pc2.cyan(`import { config } from './guardian-env.config'`)}`,
      `  ${pc2.dim("3.")} Run ${pc2.cyan("npx guardian-env check")} ${pc2.dim("to validate")}`,
      ""
    ].join("\n"));
  } else {
    lines = generateBlankConfig();
    writeFileSync(outputPath, lines.join("\n"), "utf8");
    console.log([
      "",
      `  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Created"))} ${pc2.cyan(outputFile)} ${pc2.dim("(starter template)")}`,
      "",
      `  ${pc2.bold("Next steps:")}`,
      `  ${pc2.dim("1.")} Edit ${pc2.cyan(outputFile)} ${pc2.dim("and define your env variables")}`,
      `  ${pc2.dim("2.")} Create a ${pc2.cyan(".env")} ${pc2.dim("file with actual values")}`,
      `  ${pc2.dim("3.")} Run ${pc2.cyan("npx guardian-env check")} ${pc2.dim("to validate")}`,
      ""
    ].join("\n"));
  }
}
function generateConfigFromEnv(envVars, envFile) {
  const lines = [
    `import { defineEnv, string, number, boolean, url, email, enumValidator } from "guardian-env";`,
    ``,
    `// Auto-generated from ${envFile} by guardian-env`,
    `// Adjust validators and add .describe() for documentation`,
    ``,
    `const env = defineEnv({`
  ];
  const groups = {};
  const flat = [];
  const prefixCounts = {};
  for (const key of Object.keys(envVars)) {
    const parts = key.split("_");
    if (parts.length > 1 && parts[0]) {
      prefixCounts[parts[0]] = (prefixCounts[parts[0]] ?? 0) + 1;
    }
  }
  const groupPrefixes = new Set(
    Object.entries(prefixCounts).filter(([, count]) => count >= 2).map(([prefix]) => prefix)
  );
  for (const [key, value] of Object.entries(envVars)) {
    const parts = key.split("_");
    const prefix = parts[0];
    if (prefix && groupPrefixes.has(prefix) && parts.length > 1) {
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ key, field: parts.slice(1).join("_"), value });
    } else {
      flat.push({ key, value });
    }
  }
  for (const { key, value } of flat) {
    const type = detectType(value);
    lines.push(`  ${key}: ${buildValidator(key, value, type)},`);
  }
  for (const [prefix, fields] of Object.entries(groups)) {
    lines.push(``);
    lines.push(`  ${prefix.toLowerCase()}: group(`);
    lines.push(`    {`);
    for (const { field, value, key } of fields) {
      const type = detectType(value);
      lines.push(`      ${field}: ${buildValidator(key, value, type)},`);
    }
    lines.push(`    },`);
    lines.push(`    { prefix: "${prefix}_" },`);
    lines.push(`  ),`);
  }
  if (Object.keys(groups).length > 0) {
    lines[0] = `import { defineEnv, string, number, boolean, url, email, enumValidator, group } from "guardian-env";`;
  }
  lines.push(`});`);
  lines.push(``);
  lines.push(`export default env;`);
  lines.push(``);
  lines.push(`// Use in your app:`);
  lines.push(`// export const config = env.parse();`);
  lines.push(`// export type Config = typeof config;`);
  lines.push(``);
  return lines;
}
function buildValidator(key, value, type) {
  const isRequired = value !== "";
  const suffix = isRequired ? "" : ".optional()";
  const keyUpper = key.toUpperCase();
  if (keyUpper === "PORT" || keyUpper.endsWith("_PORT")) {
    return `number().port().default(${Number(value) || 3e3})`;
  }
  if (keyUpper === "NODE_ENV") {
    return `enumValidator(["development", "production", "test"] as const).default("${value || "development"}")`;
  }
  if (keyUpper.includes("LOG_LEVEL") || keyUpper === "LOG_LEVEL") {
    return `enumValidator(["debug", "info", "warn", "error"] as const).default("${value || "info"}")`;
  }
  switch (type) {
    case "boolean":
      return `boolean()${value ? `.default(${value})` : suffix}`;
    case "number":
      return `number()${value ? `.default(${Number(value)})` : suffix}`;
    case "url":
      return `url()${suffix}`;
    case "email":
      return `email()${suffix}`;
    default: {
      if (!isRequired) return `string().optional()`;
      return `string()${value.length > 40 ? "" : `.default(${JSON.stringify(value)})`}`;
    }
  }
}
function generateBlankConfig() {
  return [
    `import { defineEnv, string, number, boolean, url, email, enumValidator } from "guardian-env";`,
    ``,
    `// Define your environment variables schema here`,
    `// Run: npx guardian-env check  to validate your .env`,
    ``,
    `const env = defineEnv({`,
    `  // Server`,
    `  PORT: number().port().default(3000),`,
    `  NODE_ENV: enumValidator(["development", "production", "test"] as const).default("development"),`,
    ``,
    `  // Add your variables below:`,
    `  // DATABASE_URL: url(),`,
    `  // API_KEY: string().min(32),`,
    `  // ADMIN_EMAIL: email().optional(),`,
    `  // DEBUG: boolean().default(false),`,
    `});`,
    ``,
    `export default env;`,
    ``,
    `// Use in your app:`,
    `// export const config = env.parse();`,
    `// export type Config = typeof config;`,
    ``
  ];
}
async function commandGenerate(args) {
  const cwd = process.cwd();
  const found = await findSchema(args.schemaFile, cwd);
  if (found) {
    let content;
    if ("generateExample" in found.schema && typeof found.schema.generateExample === "function") {
      const guardian = found.schema;
      content = guardian.generateExample({ comments: !args.noComments });
    } else {
      const guardian = defineEnv(found.schema);
      content = guardian.generateExample({ comments: !args.noComments });
    }
    const outputPath = resolve(cwd, args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(`
  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Generated"))} ${pc2.cyan(args.outputFile)} ${pc2.dim(`from ${found.schemaFile}`)}
`);
    return;
  }
  const envPath = resolve(cwd, args.envFile);
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    const envVars = parseDotEnv(envContent);
    const inferredSchema = inferSchemaFromEnv(envVars);
    const guardian = defineEnv(inferredSchema);
    const content = guardian.generateExample({ comments: !args.noComments });
    const outputPath = resolve(cwd, args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(`
  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Generated"))} ${pc2.cyan(args.outputFile)} ${pc2.dim("(inferred from .env)")}
`);
    return;
  }
  console.error(`
  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("No schema or .env file found."))} Cannot generate .env.example.
`);
  process.exit(1);
}
async function commandInspect(args) {
  const cwd = process.cwd();
  const found = await findSchema(args.schemaFile, cwd);
  if (!found) {
    console.error(`
  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("No schema file found."))} Run ${pc2.cyan("npx guardian-env init")} to create one.
`);
    process.exit(1);
  }
  let fields;
  if ("introspect" in found.schema && typeof found.schema.introspect === "function") {
    const guardian = found.schema;
    fields = guardian.introspect().fields;
  } else {
    const guardian = defineEnv(found.schema);
    fields = guardian.introspect().fields;
  }
  const colW = { key: 30, type: 24, req: 9, def: 20 };
  const header = pc2.bold(pc2.dim(" KEY".padEnd(colW.key))) + pc2.bold(pc2.dim("TYPE".padEnd(colW.type))) + pc2.bold(pc2.dim("REQ".padEnd(colW.req))) + pc2.bold(pc2.dim("DEFAULT".padEnd(colW.def))) + pc2.bold(pc2.dim("DESCRIPTION"));
  console.log(`
  ${pc2.bold(pc2.cyan("Schema Inspection"))} ${pc2.dim(`(${found.schemaFile})`)}
`);
  console.log(`  ${header}`);
  console.log(`  ${pc2.dim("\u2500".repeat(90))}`);
  for (const f of fields) {
    const key = (f.group ? `${pc2.dim(f.group + ".")}${f.key}` : f.key).padEnd(colW.key);
    const type = pc2.cyan(f.type).padEnd(colW.type + 9);
    const req = (f.required ? pc2.red("yes") : pc2.green("no")).padEnd(colW.req + 9);
    const def = (f.default !== void 0 ? pc2.dim(String(f.default)) : pc2.dim("\u2014")).padEnd(colW.def + 9);
    const desc = pc2.dim(f.description ?? "");
    console.log(`  ${key}${type}${req}${def}${desc}`);
  }
  console.log(`  ${pc2.dim("\u2500".repeat(90))}
`);
}
function printHelp() {
  console.log(`
${pc2.bold(pc2.cyan("guardian-env"))} ${pc2.dim("\u2014 zero-config environment variable validator")}

${pc2.bold("Usage:")}
  ${pc2.cyan("npx guardian-env")} ${pc2.yellow("<command>")} ${pc2.dim("[options]")}

${pc2.bold("Commands:")}
  ${pc2.yellow("check")}      Validate .env variables ${pc2.dim("(works without a schema)")}
  ${pc2.yellow("init")}       Generate a typed schema file from your .env
  ${pc2.yellow("generate")}   Generate a .env.example file
  ${pc2.yellow("inspect")}    Show schema field table
  ${pc2.yellow("help")}       Show this help

${pc2.bold("Options:")}
  ${pc2.dim("--env")}        Path to .env file          ${pc2.dim("(default: .env)")}
  ${pc2.dim("--schema")}     Path to schema file        ${pc2.dim("(default: guardian-env.config.ts)")}
  ${pc2.dim("--output")}     Output for generate        ${pc2.dim("(default: .env.example)")}
  ${pc2.dim("--strict")}     Fail on type mismatch in auto mode
  ${pc2.dim("--no-comments")} Omit comments in generated files
  ${pc2.dim("--node-env")}   Override NODE_ENV

${pc2.bold("Quick start (zero-config):")}
  ${pc2.dim("npx guardian-env check")}                 ${pc2.dim("# validate .env right now")}
  ${pc2.dim("npx guardian-env init")}                  ${pc2.dim("# generate typed config from .env")}
  ${pc2.dim("npx guardian-env generate")}              ${pc2.dim("# create .env.example")}
`);
}
async function main() {
  const args = parseArgs(process.argv);
  switch (args.command) {
    case "check":
      await commandCheck(args);
      break;
    case "init":
      await commandInit(args);
      break;
    case "generate":
      await commandGenerate(args);
      break;
    case "inspect":
      await commandInspect(args);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`
  ${pc2.red("\u2716")} Unknown command: ${pc2.cyan(args.command)}
`);
      printHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  console.error(pc2.red(String(err)));
  process.exit(1);
});
//# sourceMappingURL=cli.js.map
//# sourceMappingURL=cli.js.map