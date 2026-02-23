# guardian-env

A lightweight TypeScript-first environment variable validator for Node.js projects.

**Zero friction. Strong types. Beautiful errors.**

```ts
import { defineEnv, string, number, url, enumValidator } from "guardian-env";

const env = defineEnv({
  PORT: number().default(3000),
  DATABASE_URL: url(),
  NODE_ENV: enumValidator(["development", "production"] as const),
  API_KEY: string().min(32),
});

export const config = env.parse(); // throws with colored output if invalid
```

---

## Features

- **TypeScript-first** — full type inference from schema, no casting needed
- **Beautiful errors** — colored, grouped output with clear messages
- **Built-in validators** — `string`, `number`, `boolean`, `url`, `email`, `enum`
- **Chainable modifiers** — `.optional()`, `.default()`, `.describe()`, and type-specific constraints
- **Nested config groups** — group related vars with an optional env prefix
- **Env-specific schemas** — override schema per `NODE_ENV`
- **CLI tool** — `npx guardian-env check` validates your `.env` file
- **`.env.example` generator** — auto-generate from schema
- **Custom validators** — bring your own logic
- **Zero runtime dependencies** (except `picocolors`)

---

## Installation

```bash
npm install guardian-env
# or
pnpm add guardian-env
# or
yarn add guardian-env
```

---

## Quick Start

### 1. Define your schema

```ts
// src/env.ts
import { defineEnv, string, number, boolean, url, email, enumValidator, group } from "guardian-env";

export const env = defineEnv({
  PORT: number().port().default(3000),
  HOST: string().default("0.0.0.0"),
  NODE_ENV: enumValidator(["development", "production", "test"] as const).default("development"),

  db: group(
    {
      URL: url().describe("PostgreSQL connection URL"),
      POOL_SIZE: number().int().min(1).max(100).default(10),
      SSL: boolean().default(false),
    },
    { prefix: "DB_" }, // reads DB_URL, DB_POOL_SIZE, DB_SSL from env
  ),

  auth: group(
    {
      SECRET: string().min(32).describe("JWT signing secret"),
      EXPIRES_IN: string().default("7d"),
    },
    { prefix: "AUTH_" },
  ),

  ADMIN_EMAIL: email().optional(),
  SENTRY_DSN: url().optional(),
});

export const config = env.parse();
export type Config = typeof config;
```

### 2. Use in your app

```ts
import { config } from "./env.js";

console.log(config.PORT);        // number
console.log(config.NODE_ENV);    // "development" | "production" | "test"
console.log(config.db.URL);      // string
console.log(config.ADMIN_EMAIL); // string | undefined
```

---

## API Reference

### `defineEnv(schema)`

Defines a schema and returns an `EnvGuardian` instance.

```ts
const env = defineEnv({
  PORT: number().default(3000),
});
```

### `env.parse(options?)`

Validates and parses the environment. Throws `EnvValidationError` with colored output on failure.

```ts
const config = env.parse();

// Override env source (useful for testing)
const config = env.parse({ env: { PORT: "8080" } });

// Provide NODE_ENV override
const config = env.parse({ nodeEnv: "production" });
```

### `env.validate(options?)`

Like `parse()` but returns errors instead of throwing. Returns an empty array on success.

```ts
const errors = env.validate();
if (errors.length > 0) {
  // handle errors
}
```

### `env.generateExample(options?)`

Generates `.env.example` content from the schema.

```ts
const content = env.generateExample({ comments: true, includeDefaults: true });
fs.writeFileSync(".env.example", content);
```

### `env.introspect()`

Returns a plain object describing the schema — useful for documentation.

```ts
const { fields } = env.introspect();
// [{ key: "PORT", type: "number", required: false, default: 3000, description: "..." }]
```

### `env.forEnv(envSpecific)`

Override top-level schema fields per `NODE_ENV`.

```ts
const env = defineEnv({
  LOG_LEVEL: string(),
}).forEnv({
  development: { LOG_LEVEL: string().default("debug") },
  production:  { LOG_LEVEL: string().default("error") },
});
```

### `parseEnv(schema, options?)`

Shorthand for `defineEnv(schema).parse(options)`.

```ts
const config = parseEnv({ PORT: number().default(3000) });
```

### `group(shape, options?)`

Groups related env vars, optionally with a prefix.

```ts
const env = defineEnv({
  db: group(
    { HOST: string(), PORT: number().default(5432) },
    { prefix: "DB_" },
  ),
});

// Reads DB_HOST and DB_PORT from environment
// Returns config.db.HOST and config.db.PORT
```

Group also supports env-specific overrides:

```ts
db: group(
  { URL: url() },
  {
    prefix: "DB_",
    envSpecific: {
      test: { URL: url().default("sqlite:///:memory:") },
    },
  },
),
```

---

## Validators

### `string()`

```ts
string()
string().min(3)
string().max(100)
string().matches(/^[a-z]+$/)
```

### `number()`

```ts
number()
number().min(0)
number().max(100)
number().int()
number().port()         // shorthand for .int().min(1).max(65535)
```

### `boolean()`

Accepts: `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off` (case-insensitive).

```ts
boolean()
boolean().default(false)
```

### `url()`

```ts
url()                            // http and https by default
url().protocols("ftp", "sftp")   // custom allowed protocols
```

### `email()`

```ts
email()
```

### `enumValidator(values)`

```ts
enumValidator(["development", "production"] as const)
```

> **Note:** The function is named `enumValidator` (not `enum`) to avoid conflicting with the reserved `enum` keyword.

### Modifiers (all validators)

```ts
validator.optional()          // allow missing/undefined
validator.default(value)      // fallback if missing
validator.describe("text")    // documentation string (used in .env.example)
```

### `CustomValidator`

```ts
import { CustomValidator } from "guardian-env";

const hexColor = new CustomValidator<string>((raw) => {
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return { ok: true, value: raw };
  return { ok: false, error: `Expected hex color, got "${raw}"` };
}, "hex-color");

const env = defineEnv({ BRAND_COLOR: hexColor });
```

---

## CLI

```bash
# Validate .env against a schema file
npx guardian-env check

# Validate specific .env file
npx guardian-env check --env .env.production

# Validate with explicit schema
npx guardian-env check --schema env.schema.js

# Generate .env.example from schema
npx guardian-env generate

# Generate .env.example to custom path
npx guardian-env generate --output .env.template

# Show schema inspection table
npx guardian-env inspect

# Show help
npx guardian-env help
```

### Schema file detection

The CLI looks for schema files in this order:

1. `env.schema.ts`
2. `env.schema.js`
3. `env.schema.mjs`
4. `env.config.ts`
5. `env.config.js`

Your schema file should export a default `EnvGuardian` instance:

```ts
// env.schema.ts
import { defineEnv, string, number, url } from "guardian-env";

export default defineEnv({
  PORT: number().default(3000),
  DATABASE_URL: url(),
  API_KEY: string(),
});
```

### Error output example

```
  ✖ guardian-env: Validation failed (3 errors)
  Source: .env

  ── Missing Variables (2) ──────────────────
  ✖ DATABASE_URL → missing required variable
  ✖ API_KEY → missing required variable

  ── Invalid Variables (1) ──────────────────
  ⚠ PORT → invalid type
    received:  abc
    expected:  number
    message:   Expected a number, got "abc"

  ─────────────────────────────────────────────────
  Fix the above errors in your .env file or environment and restart.
```

---

## Error Handling

```ts
import { EnvValidationError } from "guardian-env";

try {
  const config = env.parse();
} catch (err) {
  if (err instanceof EnvValidationError) {
    console.error(err.message); // formatted colored output
    console.error(err.errors);  // structured error array
    process.exit(1);
  }
  throw err;
}
```

---

## TypeScript Types

```ts
import type { InferSchema } from "guardian-env";

const env = defineEnv({ PORT: number().default(3000) });
type Config = InferSchema<typeof env["_schema"]>;
// { PORT: number }
```

Or simply:

```ts
export const config = env.parse();
export type Config = typeof config;
```

---

## Testing

Override the `env` option to inject test values without touching `process.env`:

```ts
import { describe, it, expect } from "vitest";
import { env } from "./env.js";

describe("config", () => {
  it("uses defaults", () => {
    const config = env.parse({
      env: { DATABASE_URL: "postgresql://localhost/test" },
    });
    expect(config.PORT).toBe(3000);
  });
});
```

---

## Advanced: Runtime Type Stripping

For production builds, pass `stripTypes: true` to slightly reduce overhead by signaling that type metadata isn't needed:

```ts
const config = env.parse({ stripTypes: process.env.NODE_ENV === "production" });
```

---

## Publishing Guide

### 1. Prepare

```bash
# Install dependencies
npm install

# Build (ESM + CJS)
npm run build

# Run tests
npm test

# Type-check
npm run typecheck
```

### 2. Update `package.json`

- Set `"name"` to your package name (check availability on npmjs.com)
- Update `"version"` following semver
- Update `"author"`, `"repository"`, `"homepage"`

### 3. Login to npm

```bash
npm login
```

### 4. Dry run

```bash
npm publish --dry-run
```

Check the output — ensure only the `dist/` folder is included.

### 5. Publish

```bash
# Stable release
npm publish --access public

# Beta/RC release
npm publish --tag beta --access public
```

### 6. Tag the release on GitHub

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## License

MIT
