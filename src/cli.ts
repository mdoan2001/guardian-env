import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, extname, join } from "node:path";
import pc from "picocolors";
import type { FlatSchemaShape } from "./types.js";
import { defineEnv } from "./schema.js";
import { formatErrors, formatSuccess } from "./formatter.js";
import { string } from "./validators/string.js";
import { number } from "./validators/number.js";
import { boolean } from "./validators/boolean.js";
import { url } from "./validators/url.js";
import { email } from "./validators/email.js";

// ─── .env Parser ─────────────────────────────────────────────────────────────

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

// ─── Source Code Scanner ──────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".svelte", ".vue"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "coverage", ".turbo"]);

// Matches: process.env.FOO  import.meta.env.FOO  env.FOO (inside destructure)
const ENV_KEY_REGEX = /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g;
// Also catches: const { FOO, BAR } = process.env
const DESTRUCTURE_REGEX = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:process\.env|import\.meta\.env)/g;

function scanSourceFiles(cwd: string): Set<string> {
  const found = new Set<string>();

  function walk(dir: string): void {
    let entries: string[];
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

          // process.env.KEY or import.meta.env.KEY
          for (const match of content.matchAll(ENV_KEY_REGEX)) {
            if (match[1]) found.add(match[1]);
          }

          // const { KEY1, KEY2 } = process.env
          for (const match of content.matchAll(DESTRUCTURE_REGEX)) {
            if (!match[1]) continue;
            for (const part of match[1].split(",")) {
              const key = part.trim().split(/\s*:\s*/)[0]?.trim();
              if (key && /^[A-Z][A-Z0-9_]*$/.test(key)) found.add(key);
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(cwd);
  return found;
}

// ─── Smart type detection ─────────────────────────────────────────────────────

type InferredType = "boolean" | "number" | "url" | "email" | "string";

function detectType(value: string): InferredType {
  if (value === "true" || value === "false") return "boolean";
  if (value !== "" && !isNaN(Number(value))) return "number";
  try {
    const u = new URL(value);
    if (u.protocol === "http:" || u.protocol === "https:") return "url";
  } catch { /* not a url */ }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  return "string";
}

function inferSchemaFromEnv(env: Record<string, string>): FlatSchemaShape {
  const schema: FlatSchemaShape = {};

  for (const [key, value] of Object.entries(env)) {
    const type = detectType(value);
    switch (type) {
      case "boolean": schema[key] = boolean().optional(); break;
      case "number":  schema[key] = number().optional();  break;
      case "url":     schema[key] = url().optional();     break;
      case "email":   schema[key] = email().optional();   break;
      default:        schema[key] = string().optional();  break;
    }
  }

  return schema;
}

// ─── Project Config (from package.json) ──────────────────────────────────────

interface GuardianConfig {
  ignore: string[];
  src: string | undefined;
}

function loadProjectConfig(cwd: string): GuardianConfig {
  const pkgPath = resolve(cwd, "package.json");
  const defaults: GuardianConfig = { ignore: [], src: undefined };

  if (!existsSync(pkgPath)) return defaults;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    const cfg = pkg["guardian-env"];
    if (!cfg || typeof cfg !== "object") return defaults;

    const raw = cfg as Record<string, unknown>;
    return {
      ignore: Array.isArray(raw["ignore"])
        ? (raw["ignore"] as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      src: typeof raw["src"] === "string" ? raw["src"] : undefined,
    };
  } catch {
    return defaults;
  }
}

// ─── Schema Loader ────────────────────────────────────────────────────────────

const SCHEMA_SEARCH_PATHS = [
  "guardian-env.config.ts",
  "guardian-env.config.js",
  "guardian-env.config.mjs",
  "env.schema.ts",
  "env.schema.js",
  "env.schema.mjs",
  "env.config.ts",
  "env.config.js",
];

async function loadSchemaFile(schemaPath: string): Promise<FlatSchemaShape | null> {
  if (!existsSync(schemaPath)) return null;
  try {
    const mod = await import(schemaPath) as { default?: unknown; schema?: unknown };
    const schema = mod.default ?? mod.schema;
    if (typeof schema !== "object" || schema === null) return null;
    return schema as FlatSchemaShape;
  } catch {
    return null;
  }
}

async function findSchema(
  explicitPath: string,
  cwd: string,
): Promise<{ schema: FlatSchemaShape; schemaFile: string } | null> {
  const searchPaths = explicitPath
    ? [resolve(cwd, explicitPath)]
    : SCHEMA_SEARCH_PATHS.map((p) => resolve(cwd, p));

  for (const schemaPath of searchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (loaded) return { schema: loaded, schemaFile: basename(schemaPath) };
  }
  return null;
}

// ─── CLI Args ─────────────────────────────────────────────────────────────────

interface CliArgs {
  command: string;
  envFile: string;
  schemaFile: string;
  outputFile: string;
  noComments: boolean;
  nodeEnv: string | undefined;
  strict: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    command: "check",
    envFile: ".env",
    schemaFile: "",
    outputFile: ".env.example",
    noComments: false,
    nodeEnv: undefined,
    strict: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) { i++; continue; }

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
      if (next !== undefined) result.nodeEnv = next;
    }
    i++;
  }

  return result;
}

// ─── Command: check ───────────────────────────────────────────────────────────

async function commandCheck(args: CliArgs): Promise<void> {
  const cwd = process.cwd();
  const projectConfig = loadProjectConfig(cwd);
  const ignoreSet = new Set(projectConfig.ignore);
  const envPath = resolve(cwd, args.envFile);

  // ── 1. Load .env file ──
  if (!existsSync(envPath)) {
    console.error([
      "",
      `  ${pc.red("✖")} ${pc.bold(pc.red("No .env file found"))} at ${pc.cyan(args.envFile)}`,
      "",
      `  ${pc.dim("Create a")} ${pc.cyan(".env")} ${pc.dim("file first:")}`,
      `  ${pc.dim("  echo 'PORT=3000' > .env")}`,
      "",
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
      `  ${pc.yellow("⚠")} ${pc.bold(pc.yellow(args.envFile + " is empty"))}`,
      `  ${pc.dim("Add some environment variables and run again.")}`,
      "",
    ].join("\n"));
    return;
  }

  // ── 2. Try to find a schema file ──
  const found = await findSchema(args.schemaFile, cwd);

  if (found) {
    // ── Schema mode ──
    const guardian = "validate" in found.schema && typeof (found.schema as { validate: unknown }).validate === "function"
      ? found.schema as unknown as { validate: (opts: object) => unknown[]; introspect: () => { fields: unknown[] } }
      : Object.assign(defineEnv(found.schema), {});

    const validateFn = "validate" in guardian
      ? (opts: object) => (guardian as { validate: (opts: object) => unknown[] }).validate(opts)
      : (opts: object) => defineEnv(found.schema).validate(opts as Parameters<ReturnType<typeof defineEnv>["validate"]>[0]);

    const parseOpts = args.nodeEnv !== undefined
      ? { env: envVars, nodeEnv: args.nodeEnv }
      : { env: envVars };

    const errors = validateFn(parseOpts) as Parameters<typeof formatErrors>[0];

    console.log(`\n  ${pc.dim("Schema:")} ${pc.cyan(found.schemaFile)}`);

    if (errors.length > 0) {
      process.stderr.write(formatErrors(errors, source));
      process.exit(1);
    }

    process.stdout.write(formatSuccess(keyCount, source));
    return;
  }

  // ── 3. No schema — auto-infer mode ──

  // Priority 1: scan source code for process.env.KEY / import.meta.env.KEY
  const scanRoot = projectConfig.src ? resolve(cwd, projectConfig.src) : cwd;
  const rawScannedKeys = scanSourceFiles(scanRoot);

  // Apply ignore list
  const scannedKeys = new Set<string>();
  for (const k of rawScannedKeys) {
    if (!ignoreSet.has(k)) scannedKeys.add(k);
  }

  // Priority 2: fallback to .env.example keys
  const examplePath = resolve(cwd, ".env.example");
  const exampleVars = existsSync(examplePath)
    ? parseDotEnv(readFileSync(examplePath, "utf8"))
    : null;

  // Build the reference set of "expected" keys
  // Prefer scanned keys if found; merge with .env.example as supplement
  const expectedKeys = new Set<string>();
  let referenceSource = "";

  if (scannedKeys.size > 0) {
    for (const k of scannedKeys) expectedKeys.add(k);
    referenceSource = `source code (${scannedKeys.size} keys found)`;
  }
  if (exampleVars) {
    for (const k of Object.keys(exampleVars)) {
      if (!ignoreSet.has(k)) expectedKeys.add(k);
    }
    referenceSource = scannedKeys.size > 0
      ? `source code + .env.example`
      : `.env.example`;
  }

  // Keys that are expected but not in .env
  const missingKeys = expectedKeys.size > 0
    ? [...expectedKeys].filter((k) => !(k in envVars))
    : [];

  // Keys in .env that are not used anywhere (only report if we have source scan)
  const unusedKeys = scannedKeys.size > 0
    ? Object.keys(envVars).filter((k) => !scannedKeys.has(k) && !(exampleVars && k in exampleVars))
    : [];

  console.log([
    "",
    `  ${pc.bold(pc.cyan("guardian-env"))} ${pc.dim("— auto mode")}`,
    referenceSource
      ? `  ${pc.dim("Reference:")} ${pc.cyan(referenceSource)}`
      : `  ${pc.dim("No reference found. Add")} ${pc.cyan(".env.example")} ${pc.dim("or use")} ${pc.cyan("process.env.KEY")} ${pc.dim("in your source code.")}`,
    ignoreSet.size > 0
      ? `  ${pc.dim(`Ignoring: ${[...ignoreSet].join(", ")}`)}`
      : "",
    "",
  ].filter(Boolean).join("\n"));

  // Report missing keys
  if (missingKeys.length > 0) {
    console.log(pc.bold(pc.dim(`  ── Missing Variables (${missingKeys.length}) ──────────────────`)));
    for (const key of missingKeys) {
      console.log(`  ${pc.red("✖")} ${pc.bold(pc.red(key))} ${pc.dim("→")} ${pc.red("used in code but not set in .env")}`);
    }
    console.log("");
  }

  const inferredSchema = inferSchemaFromEnv(envVars);

  // Collect inferred results for present keys
  const rows: Array<{ key: string; value: string; type: InferredType; ok: boolean }> = [];

  for (const [key, value] of Object.entries(envVars)) {
    const type = detectType(value);
    const validator = inferredSchema[key];
    if (!validator) continue;
    const result = validator.parse(value);
    rows.push({ key, value, type, ok: result.ok });
  }

  // Print table
  const maxKeyLen = Math.max(...rows.map((r) => r.key.length), 10);
  const colKey = maxKeyLen + 2;

  console.log(
    `  ${pc.bold(pc.dim("KEY".padEnd(colKey)))}${pc.bold(pc.dim("TYPE".padEnd(12)))}${pc.bold(pc.dim("VALUE"))}`,
  );
  console.log(`  ${pc.dim("─".repeat(60))}`);

  let hasInvalid = false;
  for (const row of rows) {
    const key = row.key.padEnd(colKey);
    const type = pc.dim(row.type.padEnd(12));
    const val = row.value.length > 40 ? row.value.slice(0, 37) + "..." : row.value;
    const displayVal = row.ok ? pc.white(val) : pc.red(val);
    const status = row.ok ? "" : ` ${pc.red("✖ invalid " + row.type)}`;
    console.log(`  ${pc.bold(key)}${type}${displayVal}${status}`);
    if (!row.ok) hasInvalid = true;
  }

  console.log(`  ${pc.dim("─".repeat(60))}`);

  // Report unused keys (in .env but never read in code)
  if (unusedKeys.length > 0) {
    console.log("");
    console.log(pc.bold(pc.dim(`  ── Unused Variables (${unusedKeys.length}) ───────────────────`)));
    for (const key of unusedKeys) {
      console.log(`  ${pc.dim("·")} ${pc.dim(key)} ${pc.dim("→ in .env but not found in source code")}`);
    }
  }

  // Fail conditions
  const hasMissing = missingKeys.length > 0;
  const invalidCount = rows.filter((r) => !r.ok).length;

  if (hasMissing || (hasInvalid && args.strict)) {
    const reasons: string[] = [];
    if (hasMissing) reasons.push(`${missingKeys.length} missing`);
    if (hasInvalid && args.strict) reasons.push(`${invalidCount} invalid`);

    console.log([
      "",
      `  ${pc.red("✖")} ${pc.bold(pc.red(`Validation failed`))} ${pc.dim(`(${reasons.join(", ")})`)}`,
      hasMissing
        ? `  ${pc.dim("Add the missing variables to your")} ${pc.cyan(source)} ${pc.dim("file.")}`
        : `  ${pc.dim("Fix the invalid values in your")} ${pc.cyan(source)} ${pc.dim("file.")}`,
      "",
    ].join("\n"));
    process.exit(1);
  }

  if (invalidCount > 0) {
    console.log([
      "",
      `  ${pc.yellow("⚠")} ${pc.bold(pc.yellow(`${invalidCount} value(s) look malformed`))} ${pc.dim(`out of ${rows.length}`)}`,
      `  ${pc.dim("Run")} ${pc.cyan("npx guardian-env init")} ${pc.dim("to create a schema and validate strictly.")}`,
      "",
    ].join("\n"));
  } else {
    console.log([
      "",
      `  ${pc.green("✔")} ${pc.bold(pc.green(`All ${rows.length} variables look good`))} ${pc.dim(`(inferred from ${source})`)}`,
      !exampleVars
        ? `  ${pc.dim("Run")} ${pc.cyan("npx guardian-env init")} ${pc.dim("to add strict validation with types.")}`
        : "",
      "",
    ].filter(Boolean).join("\n"));
  }
}

// ─── Command: init ────────────────────────────────────────────────────────────

async function commandInit(args: CliArgs): Promise<void> {
  const cwd = process.cwd();
  const envPath = resolve(cwd, args.envFile);
  const outputFile = "guardian-env.config.ts";
  const outputPath = resolve(cwd, outputFile);

  // Check if config already exists
  if (existsSync(outputPath)) {
    console.log([
      "",
      `  ${pc.yellow("⚠")} ${pc.bold(pc.yellow(outputFile + " already exists"))}`,
      `  ${pc.dim("Delete it first or edit it manually.")}`,
      "",
    ].join("\n"));
    return;
  }

  let lines: string[] = [];

  if (existsSync(envPath)) {
    // Generate from .env
    const envContent = readFileSync(envPath, "utf8");
    const envVars = parseDotEnv(envContent);

    lines = generateConfigFromEnv(envVars, args.envFile);

    writeFileSync(outputPath, lines.join("\n"), "utf8");

    console.log([
      "",
      `  ${pc.green("✔")} ${pc.bold(pc.green("Created"))} ${pc.cyan(outputFile)}`,
      `  ${pc.dim(`Generated from ${args.envFile} with ${Object.keys(envVars).length} variables`)}`,
      "",
      `  ${pc.bold("Next steps:")}`,
      `  ${pc.dim("1.")} Review ${pc.cyan(outputFile)} ${pc.dim("and adjust validators as needed")}`,
      `  ${pc.dim("2.")} Import in your app: ${pc.cyan(`import { config } from './guardian-env.config'`)}`,
      `  ${pc.dim("3.")} Run ${pc.cyan("npx guardian-env check")} ${pc.dim("to validate")}`,
      "",
    ].join("\n"));
  } else {
    // No .env — generate a blank starter template
    lines = generateBlankConfig();
    writeFileSync(outputPath, lines.join("\n"), "utf8");

    console.log([
      "",
      `  ${pc.green("✔")} ${pc.bold(pc.green("Created"))} ${pc.cyan(outputFile)} ${pc.dim("(starter template)")}`,
      "",
      `  ${pc.bold("Next steps:")}`,
      `  ${pc.dim("1.")} Edit ${pc.cyan(outputFile)} ${pc.dim("and define your env variables")}`,
      `  ${pc.dim("2.")} Create a ${pc.cyan(".env")} ${pc.dim("file with actual values")}`,
      `  ${pc.dim("3.")} Run ${pc.cyan("npx guardian-env check")} ${pc.dim("to validate")}`,
      "",
    ].join("\n"));
  }
}

// ─── Config file generators ───────────────────────────────────────────────────

function generateConfigFromEnv(
  envVars: Record<string, string>,
  envFile: string,
): string[] {
  const lines: string[] = [
    `import { defineEnv, string, number, boolean, url, email, enumValidator } from "guardian-env";`,
    ``,
    `// Auto-generated from ${envFile} by guardian-env`,
    `// Adjust validators and add .describe() for documentation`,
    ``,
    `const env = defineEnv({`,
  ];

  const groups: Record<string, Array<{ key: string; field: string; value: string }>> = {};
  const flat: Array<{ key: string; value: string }> = [];

  // Group keys by common prefix (e.g. DB_HOST, DB_PORT → db group)
  const prefixCounts: Record<string, number> = {};
  for (const key of Object.keys(envVars)) {
    const parts = key.split("_");
    if (parts.length > 1 && parts[0]) {
      prefixCounts[parts[0]] = (prefixCounts[parts[0]] ?? 0) + 1;
    }
  }

  const groupPrefixes = new Set(
    Object.entries(prefixCounts)
      .filter(([, count]) => count >= 2)
      .map(([prefix]) => prefix),
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

  // Flat keys
  for (const { key, value } of flat) {
    const type = detectType(value);
    lines.push(`  ${key}: ${buildValidator(key, value, type)},`);
  }

  // Grouped keys
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

  // Add group import if needed
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

function buildValidator(key: string, value: string, type: InferredType): string {
  const isRequired = value !== "";
  const suffix = isRequired ? "" : ".optional()";

  // Special cases for common key names
  const keyUpper = key.toUpperCase();
  if (keyUpper === "PORT" || keyUpper.endsWith("_PORT")) {
    return `number().port().default(${Number(value) || 3000})`;
  }
  if (keyUpper === "NODE_ENV") {
    return `enumValidator(["development", "production", "test"] as const).default("${value || "development"}")`;
  }
  if (keyUpper.includes("LOG_LEVEL") || keyUpper === "LOG_LEVEL") {
    return `enumValidator(["debug", "info", "warn", "error"] as const).default("${value || "info"}")`;
  }

  switch (type) {
    case "boolean": return `boolean()${value ? `.default(${value})` : suffix}`;
    case "number":  return `number()${value ? `.default(${Number(value)})` : suffix}`;
    case "url":     return `url()${suffix}`;
    case "email":   return `email()${suffix}`;
    default: {
      if (!isRequired) return `string().optional()`;
      return `string()${value.length > 40 ? "" : `.default(${JSON.stringify(value)})`}`;
    }
  }
}

function generateBlankConfig(): string[] {
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
    ``,
  ];
}

// ─── Command: generate ────────────────────────────────────────────────────────

async function commandGenerate(args: CliArgs): Promise<void> {
  const cwd = process.cwd();
  const found = await findSchema(args.schemaFile, cwd);

  if (found) {
    let content: string;

    if ("generateExample" in found.schema && typeof (found.schema as { generateExample: unknown }).generateExample === "function") {
      const guardian = found.schema as unknown as { generateExample: (opts: object) => string };
      content = guardian.generateExample({ comments: !args.noComments });
    } else {
      const guardian = defineEnv(found.schema);
      content = guardian.generateExample({ comments: !args.noComments });
    }

    const outputPath = resolve(cwd, args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(`\n  ${pc.green("✔")} ${pc.bold(pc.green("Generated"))} ${pc.cyan(args.outputFile)} ${pc.dim(`from ${found.schemaFile}`)}\n`);
    return;
  }

  // No schema — infer from .env
  const envPath = resolve(cwd, args.envFile);
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    const envVars = parseDotEnv(envContent);
    const inferredSchema = inferSchemaFromEnv(envVars);
    const guardian = defineEnv(inferredSchema);
    const content = guardian.generateExample({ comments: !args.noComments });
    const outputPath = resolve(cwd, args.outputFile);
    writeFileSync(outputPath, content, "utf8");
    console.log(`\n  ${pc.green("✔")} ${pc.bold(pc.green("Generated"))} ${pc.cyan(args.outputFile)} ${pc.dim("(inferred from .env)")}\n`);
    return;
  }

  console.error(`\n  ${pc.red("✖")} ${pc.bold(pc.red("No schema or .env file found."))} Cannot generate .env.example.\n`);
  process.exit(1);
}

// ─── Command: inspect ─────────────────────────────────────────────────────────

async function commandInspect(args: CliArgs): Promise<void> {
  const cwd = process.cwd();
  const found = await findSchema(args.schemaFile, cwd);

  if (!found) {
    console.error(`\n  ${pc.red("✖")} ${pc.bold(pc.red("No schema file found."))} Run ${pc.cyan("npx guardian-env init")} to create one.\n`);
    process.exit(1);
  }

  let fields: Array<{
    key: string;
    group: string | undefined;
    type: string;
    required: boolean;
    default: unknown;
    description: string | undefined;
  }>;

  if ("introspect" in found.schema && typeof (found.schema as { introspect: unknown }).introspect === "function") {
    const guardian = found.schema as unknown as { introspect: () => { fields: typeof fields } };
    fields = guardian.introspect().fields;
  } else {
    const guardian = defineEnv(found.schema);
    fields = guardian.introspect().fields;
  }

  const colW = { key: 30, type: 24, req: 9, def: 20 };
  const header =
    pc.bold(pc.dim(" KEY".padEnd(colW.key))) +
    pc.bold(pc.dim("TYPE".padEnd(colW.type))) +
    pc.bold(pc.dim("REQ".padEnd(colW.req))) +
    pc.bold(pc.dim("DEFAULT".padEnd(colW.def))) +
    pc.bold(pc.dim("DESCRIPTION"));

  console.log(`\n  ${pc.bold(pc.cyan("Schema Inspection"))} ${pc.dim(`(${found.schemaFile})`)}\n`);
  console.log(`  ${header}`);
  console.log(`  ${pc.dim("─".repeat(90))}`);

  for (const f of fields) {
    const key = (f.group ? `${pc.dim(f.group + ".")}${f.key}` : f.key).padEnd(colW.key);
    const type = pc.cyan(f.type).padEnd(colW.type + 9);
    const req = (f.required ? pc.red("yes") : pc.green("no")).padEnd(colW.req + 9);
    const def = (f.default !== undefined ? pc.dim(String(f.default)) : pc.dim("—")).padEnd(colW.def + 9);
    const desc = pc.dim(f.description ?? "");
    console.log(`  ${key}${type}${req}${def}${desc}`);
  }

  console.log(`  ${pc.dim("─".repeat(90))}\n`);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${pc.bold(pc.cyan("guardian-env"))} ${pc.dim("— zero-config environment variable validator")}

${pc.bold("Usage:")}
  ${pc.cyan("npx guardian-env")} ${pc.yellow("<command>")} ${pc.dim("[options]")}

${pc.bold("Commands:")}
  ${pc.yellow("check")}      Validate .env variables ${pc.dim("(works without a schema)")}
  ${pc.yellow("init")}       Generate a typed schema file from your .env
  ${pc.yellow("generate")}   Generate a .env.example file
  ${pc.yellow("inspect")}    Show schema field table
  ${pc.yellow("help")}       Show this help

${pc.bold("Options:")}
  ${pc.dim("--env")}        Path to .env file          ${pc.dim("(default: .env)")}
  ${pc.dim("--schema")}     Path to schema file        ${pc.dim("(default: guardian-env.config.ts)")}
  ${pc.dim("--output")}     Output for generate        ${pc.dim("(default: .env.example)")}
  ${pc.dim("--strict")}     Fail on type mismatch in auto mode
  ${pc.dim("--no-comments")} Omit comments in generated files
  ${pc.dim("--node-env")}   Override NODE_ENV

${pc.bold("Quick start (zero-config):")}
  ${pc.dim("npx guardian-env check")}                 ${pc.dim("# validate .env right now")}
  ${pc.dim("npx guardian-env init")}                  ${pc.dim("# generate typed config from .env")}
  ${pc.dim("npx guardian-env generate")}              ${pc.dim("# create .env.example")}
`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  switch (args.command) {
    case "check":    await commandCheck(args);    break;
    case "init":     await commandInit(args);     break;
    case "generate": await commandGenerate(args); break;
    case "inspect":  await commandInspect(args);  break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`\n  ${pc.red("✖")} Unknown command: ${pc.cyan(args.command)}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(pc.red(String(err)));
  process.exit(1);
});
