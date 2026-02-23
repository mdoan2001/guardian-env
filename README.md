# guardian-env

> Catch missing or invalid environment variables **before your app starts** — with zero config.

[![npm version](https://img.shields.io/npm/v/guardian-env)](https://www.npmjs.com/package/guardian-env)
[![license](https://img.shields.io/npm/l/guardian-env)](LICENSE)
[![node](https://img.shields.io/node/v/guardian-env)](https://nodejs.org)

```bash
npm install guardian-env
```

---

## The Problem

Every Node.js app reads `process.env`, but env vars are untyped strings — a missing `DATABASE_URL` or a typo in `PORT` only blows up at runtime, deep inside your app, with a cryptic error.

**guardian-env** catches these issues at startup with a clear, actionable error. No runtime surprises.

---

## Zero Config: Just Run It

Point it at your project and go:

```bash
npx guardian-env check
```

It **scans your source code** for every `process.env.KEY` and `import.meta.env.KEY` in use, then compares against your `.env` file. Missing keys fail immediately:

```
  guardian-env — auto mode
  Reference: source code (4 keys found)

  ── Missing Variables (2) ──────────────────────────────
  ✖ DATABASE_URL   → used in code but not set in .env
  ✖ JWT_SECRET     → used in code but not set in .env

  KEY              TYPE    VALUE
  ──────────────────────────────────────────────────────
  PORT             number  3000
  API_URL          url     http://localhost:3000/api
  ──────────────────────────────────────────────────────

  ✖ Validation failed (2 missing)
  Add the missing variables to your .env file.
```

All common access patterns are supported:

```ts
process.env.API_KEY                          // Node.js
import.meta.env.PUBLIC_API_URL               // Vite / SvelteKit
const { DB_HOST, DB_PORT } = process.env     // Destructuring
```

> If no source code is found, guardian-env falls back to comparing against `.env.example`.

---

## Validators

| Validator | Description | Example |
|---|---|---|
| `string()` | Any text value | `string().min(8).max(100).matches(/regex/)` |
| `number()` | Integer or float | `number().int().min(0).max(65535)` · `number().port()` |
| `boolean()` | Accepts `true/false/1/0/yes/no/on/off` | `boolean().default(false)` |
| `url()` | Valid URL | `url().protocols("postgresql", "https")` |
| `email()` | Valid email address | `email().optional()` |
| `enumValidator()` | Restrict to allowed values | `enumValidator(["a", "b"] as const)` |

**Modifiers** — available on all validators:

```ts
string().optional()         // undefined if the variable is missing
string().default("value")   // fallback value if the variable is missing
string().describe("hint")   // shown in generated .env.example output
```

---

### Config via `package.json`

No extra config file needed. Add a `"guardian-env"` key to your `package.json`:

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
| `ignore` | Keys to skip during validation (e.g. framework-injected vars like `SITE`, `ORIGIN`) |
| `src` | Directory to scan for env usage (default: project root) |

---

## Advanced

<details>
<summary>Per-environment overrides</summary>

Override validators for specific environments:

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
<summary>Non-throwing validation</summary>

Get a list of errors instead of throwing:

```ts
const errors = env.validate(); // returns EnvError[] instead of throwing
```

</details>

<details>
<summary>Testing</summary>

Pass a mock env object directly when parsing:

```ts
const config = env.parse({
  env: { DB_URL: "postgresql://localhost/test" },
  nodeEnv: "test",
});
```

</details>

<details>
<summary>Custom validator</summary>

Write your own validator for special rules:

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

MIT © [Doan Nguyen](https://github.com/mdoan2001)
