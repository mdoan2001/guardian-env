# guardian-env

> Catch missing or invalid environment variables before your app starts — with zero config.

```bash
npm install guardian-env
```

---

## The Problem

Every Node.js app reads `process.env`. But env vars are untyped strings — a missing `DATABASE_URL` or a typo in `PORT` only blows up at runtime, deep inside your app, with a cryptic error.

**guardian-env** catches these issues at startup with a clear, actionable error. No runtime surprises.

---

## Zero-Config: Just Run It

No setup required. Point it at your project:

```bash
npx guardian-env check
```

It **scans your source code** for every `process.env.KEY` and `import.meta.env.KEY` used, then compares against your `.env` file. Missing keys fail immediately:

```
  guardian-env — auto mode
  Reference: source code (4 keys found)

  ── Missing Variables (2) ──────────────────
  ✖ PUBLIC_GIT_CLIENT_ID      → used in code but not set in .env
  ✖ PUBLIC_LINKEDIN_CLIENT_ID → used in code but not set in .env

  KEY                       TYPE    VALUE
  ──────────────────────────────────────────────────────
  PUBLIC_GOOGLE_CLIENT_ID   string  683860256203-abc...
  PUBLIC_API_URL            url     http://localhost:3000/api
  ──────────────────────────────────────────────────────

  ✖ Validation failed (2 missing)
  Add the missing variables to your .env file.
```

Supports `process.env`, `import.meta.env` (Vite/SvelteKit), and destructuring:

```ts
process.env.API_KEY
import.meta.env.PUBLIC_API_URL
const { DB_HOST, DB_PORT } = process.env
```

If no source code is found, falls back to comparing against `.env.example`.

---

## Typed Validation in Code

For stricter validation with full TypeScript inference:

```ts
// src/env.ts
import { defineEnv, string, number, boolean, url, email, enumValidator, group } from "guardian-env";

export const env = defineEnv({
  PORT:     number().port().default(3000),
  NODE_ENV: enumValidator(["development", "production", "test"] as const).default("development"),

  db: group(
    {
      URL:       url(),
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
// Anywhere in your app — fully typed, no casting
import { config } from "./env.js";

config.PORT          // number
config.NODE_ENV      // "development" | "production" | "test"
config.db.URL        // string
config.ADMIN_EMAIL   // string | undefined
```

Error output on startup failure:

```
  ✖ guardian-env: Validation failed (2 errors)

  ── Missing Variables ──────────────────────
  ✖ DB_URL     → missing required variable
  ✖ JWT_SECRET → missing required variable

  Fix the above errors in your .env file and restart.
```

---

## Validators

| Validator | Example |
|---|---|
| `string()` | `string().min(8).max(100).matches(/regex/)` |
| `number()` | `number().int().min(0).max(65535)` / `number().port()` |
| `boolean()` | accepts `true / false / 1 / 0 / yes / no / on / off` |
| `url()` | `url().protocols("postgresql", "https")` |
| `email()` | `email()` |
| `enumValidator()` | `enumValidator(["a", "b"] as const)` |

**Modifiers** — available on all validators:

```ts
string().optional()        // undefined if missing
string().default("value")  // fallback if missing
string().describe("hint")  // shown in generated .env.example
```

---

## CLI

```bash
npx guardian-env check              # scan source + validate .env
npx guardian-env init               # generate guardian-env.config.ts from .env
npx guardian-env generate           # create .env.example
npx guardian-env inspect            # show schema field table
```

**Options:**

```bash
--env .env.production    # use a different .env file
--schema path/to/file    # use a specific schema file
--strict                 # fail on type mismatch in auto mode
```

### Config in `package.json`

No extra files needed. Add a `"guardian-env"` key to your `package.json`:

```json
{
  "guardian-env": {
    "ignore": ["SITE", "ORIGIN"],
    "src": "src"
  }
}
```

| Option | Description |
|---|---|
| `ignore` | Keys to exclude from validation (e.g. framework-injected vars like `SITE`, `ORIGIN`) |
| `src` | Directory to scan for env usage (default: project root) |

---

## Advanced

<details>
<summary>Env-specific overrides</summary>

```ts
const env = defineEnv({
  LOG_LEVEL: string(),
}).forEnv({
  development: { LOG_LEVEL: string().default("debug") },
  production:  { LOG_LEVEL: string().default("error") },
});
```

</details>

<details>
<summary>Group with per-environment schema</summary>

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

</details>

<details>
<summary>No-throw validation</summary>

```ts
const errors = env.validate(); // returns EnvError[] instead of throwing
```

</details>

<details>
<summary>Testing</summary>

```ts
const config = env.parse({
  env: { DB_URL: "postgresql://localhost/test" },
  nodeEnv: "test",
});
```

</details>

<details>
<summary>Custom validator</summary>

```ts
import { CustomValidator } from "guardian-env";

const hexColor = new CustomValidator<string>((raw) => {
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return { ok: true, value: raw };
  return { ok: false, error: `Expected a hex color, got "${raw}"` };
});

const env = defineEnv({ BRAND_COLOR: hexColor });
```

</details>

---

## License

MIT
