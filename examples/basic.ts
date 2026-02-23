/**
 * Basic usage example for env-guardian
 *
 * Run: npx tsx examples/basic.ts
 */
import {
  defineEnv,
  string,
  number,
  boolean,
  url,
  email,
  enumValidator,
  group,
} from "../src/index.js";

// ─── Define your schema ───────────────────────────────────────────────────────

const env = defineEnv({
  // Server
  PORT: number().port().default(3000).describe("HTTP server port"),
  HOST: string().default("0.0.0.0").describe("HTTP server host"),
  NODE_ENV: enumValidator(["development", "production", "test"] as const)
    .default("development")
    .describe("Runtime environment"),

  // Database group with prefix
  db: group(
    {
      URL: url().describe("Primary database connection URL"),
      POOL_SIZE: number().int().min(1).max(100).default(10).describe("Connection pool size"),
      SSL: boolean().default(false).describe("Enable SSL connections"),
    },
    { prefix: "DB_" },
  ),

  // Auth
  auth: group(
    {
      SECRET: string().min(32).describe("JWT signing secret"),
      EXPIRES_IN: string().default("7d").describe("Token expiry duration"),
    },
    { prefix: "AUTH_" },
  ),

  // Optional integrations
  SMTP_HOST: string().optional().describe("SMTP server hostname"),
  SMTP_PORT: number().port().default(587).describe("SMTP server port"),
  ADMIN_EMAIL: email().optional().describe("Admin notification email"),
  SENTRY_DSN: url().optional().describe("Sentry error tracking DSN"),
}).forEnv({
  // In development, relax some requirements
  development: {
    ADMIN_EMAIL: email().default("dev@localhost.com"),
  },
  // In test, use in-memory options
  test: {
    SMTP_HOST: string().default("localhost"),
  },
});

// ─── Parse — throws EnvValidationError if invalid ────────────────────────────

// Simulate env for the example (in production, omit the `env:` option)
export const config = env.parse({
  env: {
    PORT: "8080",
    HOST: "localhost",
    NODE_ENV: "development",
    DB_URL: "postgresql://user:pass@localhost:5432/mydb",
    DB_POOL_SIZE: "5",
    DB_SSL: "false",
    AUTH_SECRET: "super-secret-key-that-is-32-chars-long!!",
    AUTH_EXPIRES_IN: "24h",
  },
});

// ─── Full TypeScript inference ────────────────────────────────────────────────
// config.PORT             → number
// config.NODE_ENV         → "development" | "production" | "test"
// config.db.URL           → string
// config.db.POOL_SIZE     → number
// config.auth.SECRET      → string
// config.ADMIN_EMAIL      → string | undefined
// config.SENTRY_DSN       → string | undefined

console.log("✓ Configuration loaded:");
console.log(`  PORT: ${config.PORT}`);
console.log(`  NODE_ENV: ${config.NODE_ENV}`);
console.log(`  db.URL: ${config.db.URL}`);
console.log(`  db.POOL_SIZE: ${config.db.POOL_SIZE}`);
console.log(`  auth.EXPIRES_IN: ${config.auth.EXPIRES_IN}`);

// ─── Generate .env.example ────────────────────────────────────────────────────

const example = env.generateExample({ comments: true });
console.log("\n.env.example content:\n");
console.log(example);
