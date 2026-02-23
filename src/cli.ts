import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import pc from "picocolors";
import type { FlatSchemaShape } from "./types.js";
import { defineEnv } from "./schema.js";
import { formatErrors, formatSuccess } from "./formatter.js";
import { string } from "./validators/string.js";
import { number } from "./validators/number.js";
import { boolean } from "./validators/boolean.js";

// ─── .env Parser ─────────────────────────────────────────────────────────────

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

// ─── Schema Loader ────────────────────────────────────────────────────────────

async function loadSchemaFile(schemaPath: string): Promise<FlatSchemaShape | null> {
  if (!existsSync(schemaPath)) return null;

  try {
    const mod = await import(schemaPath) as { default?: unknown; schema?: unknown };
    const schema = mod.default ?? mod.schema;

    if (typeof schema !== "object" || schema === null) {
      return null;
    }

    // Check if it's an EnvGuardian instance
    if (
      "parse" in schema &&
      "validate" in schema &&
      typeof (schema as { validate: unknown }).validate === "function"
    ) {
      return schema as unknown as FlatSchemaShape;
    }

    return schema as FlatSchemaShape;
  } catch {
    return null;
  }
}

// ─── Infer schema from .env file ─────────────────────────────────────────────

function inferSchemaFromEnv(env: Record<string, string>): FlatSchemaShape {
  const schema: FlatSchemaShape = {};

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

// ─── CLI Commands ─────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${pc.bold(pc.cyan("env-guardian"))} ${pc.dim("— TypeScript-first environment validator")}

${pc.bold("Usage:")}
  ${pc.cyan("npx env-guardian")} ${pc.yellow("<command>")} ${pc.dim("[options]")}

${pc.bold("Commands:")}
  ${pc.yellow("check")}           Validate .env file against schema
  ${pc.yellow("generate")}        Generate a .env.example from schema or .env file
  ${pc.yellow("inspect")}         Show schema introspection table
  ${pc.yellow("help")}            Show this help message

${pc.bold("Options:")}
  ${pc.dim("--env")}           Path to .env file ${pc.dim("(default: .env)")}
  ${pc.dim("--schema")}        Path to schema file ${pc.dim("(default: env.schema.ts / env.schema.js)")}
  ${pc.dim("--output")}        Output file for generate command ${pc.dim("(default: .env.example)")}
  ${pc.dim("--no-comments")}   Omit comments in generated file
  ${pc.dim("--node-env")}      Override NODE_ENV for env-specific validation

${pc.bold("Examples:")}
  ${pc.dim("npx env-guardian check")}
  ${pc.dim("npx env-guardian check --env .env.production --schema env.schema.js")}
  ${pc.dim("npx env-guardian generate --output .env.example")}
  ${pc.dim("npx env-guardian inspect")}
`);
}

interface CliArgs {
  command: string;
  envFile: string;
  schemaFile: string;
  outputFile: string;
  noComments: boolean;
  nodeEnv: string | undefined;
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
  const envPath = resolve(process.cwd(), args.envFile);

  if (!existsSync(envPath)) {
    console.error(
      `\n  ${pc.red("✖")} ${pc.bold(pc.red("File not found:"))} ${pc.cyan(args.envFile)}\n`,
    );
    process.exit(1);
  }

  const envContent = readFileSync(envPath, "utf8");
  const envVars = parseDotEnv(envContent);
  const source = basename(envPath);

  // Try to load schema file
  const schemaSearchPaths = args.schemaFile
    ? [resolve(process.cwd(), args.schemaFile)]
    : [
        resolve(process.cwd(), "env.schema.ts"),
        resolve(process.cwd(), "env.schema.js"),
        resolve(process.cwd(), "env.schema.mjs"),
        resolve(process.cwd(), "env.config.ts"),
        resolve(process.cwd(), "env.config.js"),
      ];

  let schemaLoaded = false;

  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);

    if (loaded) {
      schemaLoaded = true;

      // If it's an EnvGuardian instance
      if ("validate" in loaded && typeof (loaded as { validate: unknown }).validate === "function") {
        const guardian = loaded as unknown as { validate: (opts: object) => unknown[] };
        const errors = guardian.validate({
          env: envVars,
          nodeEnv: args.nodeEnv,
        }) as Array<{ key: string; kind: string; message: string; received?: string; expected?: string }>;

        if (errors.length > 0) {
          process.stderr.write(formatErrors(errors as Parameters<typeof formatErrors>[0], source));
          process.exit(1);
        }

        const count = Object.keys(envVars).length;
        process.stdout.write(formatSuccess(count, source));
        return;
      }

      // Otherwise treat as raw FlatSchemaShape
      const guardian = defineEnv(loaded);
      const parseOpts = args.nodeEnv !== undefined
        ? { env: envVars, nodeEnv: args.nodeEnv }
        : { env: envVars };
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
    // No schema found — validate that .env is parseable and show the keys
    const count = Object.keys(envVars).length;
    console.log(
      `\n  ${pc.yellow("⚠")} ${pc.bold(pc.yellow("No schema file found."))} Validating .env syntax only.\n` +
      `  ${pc.dim("Create env.schema.ts or pass --schema to enable full validation.")}\n`,
    );
    process.stdout.write(formatSuccess(count, source));
  }
}

// ─── Command: generate ────────────────────────────────────────────────────────

async function commandGenerate(args: CliArgs): Promise<void> {
  const schemaSearchPaths = args.schemaFile
    ? [resolve(process.cwd(), args.schemaFile)]
    : [
        resolve(process.cwd(), "env.schema.ts"),
        resolve(process.cwd(), "env.schema.js"),
        resolve(process.cwd(), "env.schema.mjs"),
        resolve(process.cwd(), "env.config.ts"),
        resolve(process.cwd(), "env.config.js"),
      ];

  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (!loaded) continue;

    let content: string;

    if ("generateExample" in loaded && typeof (loaded as { generateExample: unknown }).generateExample === "function") {
      const guardian = loaded as unknown as { generateExample: (opts: object) => string };
      content = guardian.generateExample({ comments: !args.noComments });
    } else {
      const guardian = defineEnv(loaded);
      content = guardian.generateExample({ comments: !args.noComments });
    }

    const outputPath = resolve(process.cwd(), args.outputFile);
    writeFileSync(outputPath, content, "utf8");

    console.log(
      `\n  ${pc.green("✔")} ${pc.bold(pc.green("Generated"))} ${pc.cyan(args.outputFile)}\n`,
    );
    return;
  }

  // No schema — generate from existing .env
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
      `\n  ${pc.green("✔")} ${pc.bold(pc.green("Generated"))} ${pc.cyan(args.outputFile)} ${pc.dim("(inferred from .env)")}\n`,
    );
    return;
  }

  console.error(
    `\n  ${pc.red("✖")} ${pc.bold(pc.red("No schema or .env file found."))} Cannot generate .env.example.\n`,
  );
  process.exit(1);
}

// ─── Command: inspect ─────────────────────────────────────────────────────────

async function commandInspect(args: CliArgs): Promise<void> {
  const schemaSearchPaths = args.schemaFile
    ? [resolve(process.cwd(), args.schemaFile)]
    : [
        resolve(process.cwd(), "env.schema.ts"),
        resolve(process.cwd(), "env.schema.js"),
        resolve(process.cwd(), "env.schema.mjs"),
      ];

  for (const schemaPath of schemaSearchPaths) {
    const loaded = await loadSchemaFile(schemaPath);
    if (!loaded) continue;

    let fields: Array<{ key: string; group: string | undefined; type: string; required: boolean; default: unknown; description: string | undefined }>;

    if ("introspect" in loaded && typeof (loaded as { introspect: unknown }).introspect === "function") {
      const guardian = loaded as unknown as { introspect: () => { fields: typeof fields } };
      fields = guardian.introspect().fields;
    } else {
      const guardian = defineEnv(loaded);
      fields = guardian.introspect().fields;
    }

    const colW = { key: 30, type: 24, req: 9, def: 20 };

    const header =
      pc.bold(pc.dim(" KEY".padEnd(colW.key))) +
      pc.bold(pc.dim("TYPE".padEnd(colW.type))) +
      pc.bold(pc.dim("REQ".padEnd(colW.req))) +
      pc.bold(pc.dim("DEFAULT".padEnd(colW.def))) +
      pc.bold(pc.dim("DESCRIPTION"));

    console.log(`\n  ${pc.bold(pc.cyan("Schema Inspection"))}\n`);
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
    return;
  }

  console.error(
    `\n  ${pc.red("✖")} ${pc.bold(pc.red("No schema file found."))} Pass ${pc.cyan("--schema")} to specify one.\n`,
  );
  process.exit(1);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
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
      console.error(`\n  ${pc.red("✖")} Unknown command: ${pc.cyan(args.command)}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(pc.red(String(err)));
  process.exit(1);
});
