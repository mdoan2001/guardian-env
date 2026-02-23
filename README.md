# guardian-env

> Validate environment variables at startup — before your app runs into mysterious crashes.

```bash
npm install guardian-env
```

---

## The Problem

Every Node.js app reads from `process.env`. But environment variables are untyped strings — a missing `DATABASE_URL` or a typo in `PORT` only blows up at runtime, deep inside your application, with a cryptic error.

**guardian-env validates your env at startup**, throws a clear error immediately, and gives you full TypeScript types throughout your codebase.

---

## Zero-Config Quick Start

No schema? No problem. Just run:

```bash
npx guardian-env check
```

It reads your `.env`, infers types, and reports the result:

```
  KEY           TYPE        VALUE
  ────────────────────────────────────────────────────
  PORT          number      3000
  DATABASE_URL  url         https://db.example.com
  ADMIN_EMAIL   email       admin@example.com
  DEBUG         boolean     false
  ────────────────────────────────────────────────────

  ✔ All 4 variables look good
  Run npx guardian-env init to add strict validation with types.
```

Then generate a typed schema from your `.env` automatically:

```bash
npx guardian-env init
```

This creates `guardian-env.config.ts` — ready to import in your app.

---

## Usage in Code

```ts
// src/env.ts
import { defineEnv, string, number, boolean, url, email, enumValidator, group } from "guardian-env";

export const env = defineEnv({
  PORT:     number().port().default(3000),
  NODE_ENV: enumValidator(["development", "production", "test"] as const).default("development"),

  db: group(
    {
      URL:       url().describe("PostgreSQL connection string"),
      POOL_SIZE: number().int().min(1).default(10),
      SSL:       boolean().default(false),
    },
    { prefix: "DB_" }, // reads DB_URL, DB_POOL_SIZE, DB_SSL
  ),

  JWT_SECRET:  string().min(32),
  ADMIN_EMAIL: email().optional(),
});

export const config = env.parse(); // throws on startup if env is invalid
export type Config = typeof config;
```

```ts
// Anywhere in your app — fully typed
import { config } from "./env.js";

config.PORT          // number
config.NODE_ENV      // "development" | "production" | "test"
config.db.URL        // string
config.db.POOL_SIZE  // number
config.ADMIN_EMAIL   // string | undefined
```

If validation fails, you get a clear error immediately on startup:

```
  ✖ guardian-env: Validation failed (2 errors)

  ── Missing Variables ──────────────────────
  ✖ DB_URL      → missing required variable
  ✖ JWT_SECRET  → missing required variable

  Fix the above errors in your .env file and restart.
```

---

## Validators

| Validator | Example |
|---|---|
| `string()` | `string().min(8).max(100).matches(/regex/)` |
| `number()` | `number().int().min(0).max(65535)` / `number().port()` |
| `boolean()` | accepts `true/false/1/0/yes/no/on/off` |
| `url()` | `url().protocols("postgresql", "https")` |
| `email()` | `email()` |
| `enumValidator()` | `enumValidator(["a", "b"] as const)` |

**Modifiers** — available on every validator:

```ts
string().optional()       // allow missing → value is string | undefined
string().default("foo")   // use fallback when missing
string().describe("hint") // shown in .env.example and npx guardian-env inspect
```

---

## CLI

```bash
npx guardian-env check              # validate .env (auto-infer if no schema)
npx guardian-env init               # generate guardian-env.config.ts from .env
npx guardian-env generate           # create .env.example
npx guardian-env inspect            # show schema field table
```

```bash
# Options
--env .env.production               # use a different .env file
--schema path/to/schema.ts          # use a specific schema file
--strict                            # fail on type mismatch in auto mode
```

### Schema file auto-detection

The CLI looks for schema files in this order:

1. `guardian-env.config.ts` / `.js`
2. `env.schema.ts` / `.js`
3. `env.config.ts` / `.js`

---

## Advanced

### Env-specific overrides

```ts
const env = defineEnv({
  LOG_LEVEL: string(),
}).forEnv({
  development: { LOG_LEVEL: string().default("debug") },
  production:  { LOG_LEVEL: string().default("error") },
});
```

### Group with env-specific override

```ts
db: group(
  { URL: url() },
  {
    prefix: "DB_",
    envSpecific: {
      test: { URL: url().default("postgresql://localhost/test") },
    },
  },
),
```

### No-throw validation

```ts
const errors = env.validate(); // returns EnvError[] instead of throwing
```

### Testing

```ts
const config = env.parse({
  env: { DB_URL: "postgresql://localhost/test" }, // inject test values
  nodeEnv: "test",
});
```

### Custom validator

```ts
import { CustomValidator } from "guardian-env";

const hexColor = new CustomValidator<string>((raw) => {
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return { ok: true, value: raw };
  return { ok: false, error: `Expected a hex color, got "${raw}"` };
});

const env = defineEnv({ BRAND_COLOR: hexColor });
```

---

## License

MIT
