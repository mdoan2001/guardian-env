import pc from "picocolors";
import type { EnvError } from "./types.js";

const ICONS = {
  missing: "✖",
  invalid_type: "⚠",
  invalid_format: "⚠",
  invalid_value: "⚠",
  success: "✔",
  error: "✖",
} as const;

function formatError(err: EnvError): string {
  const icon = ICONS[err.kind];

  switch (err.kind) {
    case "missing":
      return `  ${pc.red(icon)} ${pc.bold(pc.red(err.key))} ${pc.dim("→")} ${pc.red("missing required variable")}`;

    case "invalid_type":
      return [
        `  ${pc.yellow(icon)} ${pc.bold(pc.yellow(err.key))} ${pc.dim("→")} ${pc.yellow("invalid type")}`,
        err.received !== undefined
          ? `    ${pc.dim("received:")}  ${pc.white(err.received)}`
          : "",
        err.expected !== undefined
          ? `    ${pc.dim("expected:")}  ${pc.cyan(err.expected)}`
          : "",
        `    ${pc.dim("message:")}   ${pc.white(err.message)}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "invalid_format":
    case "invalid_value":
      return [
        `  ${pc.yellow(icon)} ${pc.bold(pc.yellow(err.key))} ${pc.dim("→")} ${pc.yellow(err.kind === "invalid_format" ? "invalid format" : "invalid value")}`,
        err.received !== undefined
          ? `    ${pc.dim("received:")}  ${pc.white(err.received)}`
          : "",
        err.expected !== undefined
          ? `    ${pc.dim("expected:")}  ${pc.cyan(err.expected)}`
          : "",
        `    ${pc.dim("message:")}   ${pc.white(err.message)}`,
      ]
        .filter(Boolean)
        .join("\n");
  }
}

export function formatErrors(errors: EnvError[], source = "env"): string {
  const lines: string[] = [];

  const missing = errors.filter((e) => e.kind === "missing");
  const invalid = errors.filter((e) => e.kind !== "missing");

  lines.push("");
  lines.push(
    pc.bold(pc.red(`  ${ICONS.error} env-guardian: Validation failed`)) +
      pc.dim(` (${errors.length} error${errors.length !== 1 ? "s" : ""})`),
  );
  lines.push(pc.dim(`  Source: ${source}`));
  lines.push("");

  if (missing.length > 0) {
    lines.push(pc.bold(pc.dim(`  ── Missing Variables (${missing.length}) ──────────────────`)));
    for (const err of missing) {
      lines.push(formatError(err));
    }
    lines.push("");
  }

  if (invalid.length > 0) {
    lines.push(pc.bold(pc.dim(`  ── Invalid Variables (${invalid.length}) ──────────────────`)));
    for (const err of invalid) {
      lines.push(formatError(err));
    }
    lines.push("");
  }

  lines.push(pc.dim("  ─────────────────────────────────────────────────"));
  lines.push(
    pc.dim("  Fix the above errors in your ") +
      pc.cyan(".env") +
      pc.dim(" file or environment and restart."),
  );
  lines.push("");

  return lines.join("\n");
}

export function formatSuccess(count: number, source = "env"): string {
  return [
    "",
    `  ${pc.green(ICONS.success)} ${pc.bold(pc.green("env-guardian: All variables valid"))} ${pc.dim(`(${count} checked)`)}`,
    pc.dim(`  Source: ${source}`),
    "",
  ].join("\n");
}

export class EnvValidationError extends Error {
  readonly errors: EnvError[];

  constructor(errors: EnvError[], source?: string) {
    super(`Environment validation failed with ${errors.length} error(s)`);
    this.name = "EnvValidationError";
    this.errors = errors;
    // Append formatted output to the error message for non-TTY contexts
    this.message = formatErrors(errors, source);
  }
}
