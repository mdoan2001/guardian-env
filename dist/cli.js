#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, basename } from 'path';
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
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key) {
      result[key] = value;
    }
  }
  return result;
}
async function loadSchemaFile(schemaPath) {
  if (!existsSync(schemaPath)) return null;
  try {
    const mod = await import(schemaPath);
    const schema = mod.default ?? mod.schema;
    if (typeof schema !== "object" || schema === null) {
      return null;
    }
    if ("parse" in schema && "validate" in schema && typeof schema.validate === "function") {
      return schema;
    }
    return schema;
  } catch {
    return null;
  }
}
function inferSchemaFromEnv(env) {
  const schema = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === "true" || value === "false") {
      schema[key] = boolean().optional();
    } else if (!isNaN(Number(value)) && value !== "") {
      schema[key] = number().optional();
    } else {
      schema[key] = string().optional();
    }
  }
  return schema;
}
function printHelp() {
  console.log(`
${pc2.bold(pc2.cyan("env-guardian"))} ${pc2.dim("\u2014 TypeScript-first environment validator")}

${pc2.bold("Usage:")}
  ${pc2.cyan("npx env-guardian")} ${pc2.yellow("<command>")} ${pc2.dim("[options]")}

${pc2.bold("Commands:")}
  ${pc2.yellow("check")}           Validate .env file against schema
  ${pc2.yellow("generate")}        Generate a .env.example from schema or .env file
  ${pc2.yellow("inspect")}         Show schema introspection table
  ${pc2.yellow("help")}            Show this help message

${pc2.bold("Options:")}
  ${pc2.dim("--env")}           Path to .env file ${pc2.dim("(default: .env)")}
  ${pc2.dim("--schema")}        Path to schema file ${pc2.dim("(default: env.schema.ts / env.schema.js)")}
  ${pc2.dim("--output")}        Output file for generate command ${pc2.dim("(default: .env.example)")}
  ${pc2.dim("--no-comments")}   Omit comments in generated file
  ${pc2.dim("--node-env")}      Override NODE_ENV for env-specific validation

${pc2.bold("Examples:")}
  ${pc2.dim("npx env-guardian check")}
  ${pc2.dim("npx env-guardian check --env .env.production --schema env.schema.js")}
  ${pc2.dim("npx env-guardian generate --output .env.example")}
  ${pc2.dim("npx env-guardian inspect")}
`);
}
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: "check",
    envFile: ".env",
    schemaFile: "",
    outputFile: ".env.example",
    noComments: false,
    nodeEnv: void 0
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
    } else if (arg === "--node-env" && args[i + 1]) {
      const next = args[++i];
      if (next !== void 0) result.nodeEnv = next;
    }
    i++;
  }
  return result;
}
async function commandCheck(args) {
  const envPath = resolve(process.cwd(), args.envFile);
  if (!existsSync(envPath)) {
    console.error(
      `
  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("File not found:"))} ${pc2.cyan(args.envFile)}
`
    );
    process.exit(1);
  }
  const envContent = readFileSync(envPath, "utf8");
  const envVars = parseDotEnv(envContent);
  const source = basename(envPath);
  const schemaSearchPaths = args.schemaFile ? [resolve(process.cwd(), args.schemaFile)] : [
    resolve(process.cwd(), "env.schema.ts"),
    resolve(process.cwd(), "env.schema.js"),
    resolve(process.cwd(), "env.schema.mjs"),
    resolve(process.cwd(), "env.config.ts"),
    resolve(process.cwd(), "env.config.js")
  ];
  let schemaLoaded = false;
  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (loaded) {
      schemaLoaded = true;
      if ("validate" in loaded && typeof loaded.validate === "function") {
        const guardian2 = loaded;
        const errors2 = guardian2.validate({
          env: envVars,
          nodeEnv: args.nodeEnv
        });
        if (errors2.length > 0) {
          process.stderr.write(formatErrors(errors2, source));
          process.exit(1);
        }
        const count2 = Object.keys(envVars).length;
        process.stdout.write(formatSuccess(count2, source));
        return;
      }
      const guardian = defineEnv(loaded);
      const parseOpts = args.nodeEnv !== void 0 ? { env: envVars, nodeEnv: args.nodeEnv } : { env: envVars };
      const errors = guardian.validate(parseOpts);
      if (errors.length > 0) {
        process.stderr.write(formatErrors(errors, source));
        process.exit(1);
      }
      const count = Object.keys(envVars).length;
      process.stdout.write(formatSuccess(count, source));
      return;
    }
  }
  if (!schemaLoaded) {
    const count = Object.keys(envVars).length;
    console.log(
      `
  ${pc2.yellow("\u26A0")} ${pc2.bold(pc2.yellow("No schema file found."))} Validating .env syntax only.
  ${pc2.dim("Create env.schema.ts or pass --schema to enable full validation.")}
`
    );
    process.stdout.write(formatSuccess(count, source));
  }
}
async function commandGenerate(args) {
  const schemaSearchPaths = args.schemaFile ? [resolve(process.cwd(), args.schemaFile)] : [
    resolve(process.cwd(), "env.schema.ts"),
    resolve(process.cwd(), "env.schema.js"),
    resolve(process.cwd(), "env.schema.mjs"),
    resolve(process.cwd(), "env.config.ts"),
    resolve(process.cwd(), "env.config.js")
  ];
  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (!loaded) continue;
    let content;
    if ("generateExample" in loaded && typeof loaded.generateExample === "function") {
      const guardian = loaded;
      content = guardian.generateExample({ comments: !args.noComments });
    } else {
      const guardian = defineEnv(loaded);
      content = guardian.generateExample({ comments: !args.noComments });
    }
    const outputPath = resolve(process.cwd(), args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(
      `
  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Generated"))} ${pc2.cyan(args.outputFile)}
`
    );
    return;
  }
  const envPath = resolve(process.cwd(), args.envFile);
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    const envVars = parseDotEnv(envContent);
    const inferredSchema = inferSchemaFromEnv(envVars);
    const guardian = defineEnv(inferredSchema);
    const content = guardian.generateExample({ comments: !args.noComments });
    const outputPath = resolve(process.cwd(), args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(
      `
  ${pc2.green("\u2714")} ${pc2.bold(pc2.green("Generated"))} ${pc2.cyan(args.outputFile)} ${pc2.dim("(inferred from .env)")}
`
    );
    return;
  }
  console.error(
    `
  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("No schema or .env file found."))} Cannot generate .env.example.
`
  );
  process.exit(1);
}
async function commandInspect(args) {
  const schemaSearchPaths = args.schemaFile ? [resolve(process.cwd(), args.schemaFile)] : [
    resolve(process.cwd(), "env.schema.ts"),
    resolve(process.cwd(), "env.schema.js"),
    resolve(process.cwd(), "env.schema.mjs")
  ];
  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (!loaded) continue;
    let fields;
    if ("introspect" in loaded && typeof loaded.introspect === "function") {
      const guardian = loaded;
      fields = guardian.introspect().fields;
    } else {
      const guardian = defineEnv(loaded);
      fields = guardian.introspect().fields;
    }
    const colW = { key: 30, type: 24, req: 9, def: 20 };
    const header = pc2.bold(pc2.dim(" KEY".padEnd(colW.key))) + pc2.bold(pc2.dim("TYPE".padEnd(colW.type))) + pc2.bold(pc2.dim("REQ".padEnd(colW.req))) + pc2.bold(pc2.dim("DEFAULT".padEnd(colW.def))) + pc2.bold(pc2.dim("DESCRIPTION"));
    console.log(`
  ${pc2.bold(pc2.cyan("Schema Inspection"))}
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
    return;
  }
  console.error(
    `
  ${pc2.red("\u2716")} ${pc2.bold(pc2.red("No schema file found."))} Pass ${pc2.cyan("--schema")} to specify one.
`
  );
  process.exit(1);
}
async function main() {
  const args = parseArgs(process.argv);
  switch (args.command) {
    case "check":
      await commandCheck(args);
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