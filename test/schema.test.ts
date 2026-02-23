import { describe, it, expect } from "vitest";
import { defineEnv, parseEnv, group } from "../src/schema.js";
import { string } from "../src/validators/string.js";
import { number } from "../src/validators/number.js";
import { boolean } from "../src/validators/boolean.js";
import { url } from "../src/validators/url.js";
import { email } from "../src/validators/email.js";
import { enumValidator } from "../src/validators/enum.js";
import { EnvValidationError } from "../src/formatter.js";

// ─── Basic defineEnv ──────────────────────────────────────────────────────────

describe("defineEnv()", () => {
  it("parses valid env", () => {
    const env = defineEnv({
      PORT: number().default(3000),
      DATABASE_URL: url(),
      NODE_ENV: enumValidator(["development", "production"] as const),
    });

    const config = env.parse({
      env: {
        PORT: "8080",
        DATABASE_URL: "https://db.example.com",
        NODE_ENV: "production",
      },
    });

    expect(config).toEqual({
      PORT: 8080,
      DATABASE_URL: "https://db.example.com",
      NODE_ENV: "production",
    });
  });

  it("uses default values when env not set", () => {
    const env = defineEnv({
      PORT: number().default(3000),
      DEBUG: boolean().default(false),
    });

    const config = env.parse({ env: {} });
    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
  });

  it("throws EnvValidationError on missing required key", () => {
    const env = defineEnv({
      DATABASE_URL: url(),
    });

    expect(() => env.parse({ env: {} })).toThrowError(EnvValidationError);
  });

  it("throws with multiple errors at once", () => {
    const env = defineEnv({
      DATABASE_URL: url(),
      API_KEY: string(),
      PORT: number(),
    });

    let thrown: EnvValidationError | null = null;
    try {
      env.parse({ env: {} });
    } catch (err) {
      if (err instanceof EnvValidationError) thrown = err;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.errors.length).toBe(3);
  });

  it("reports missing kind for missing variables", () => {
    const env = defineEnv({ API_KEY: string() });
    let thrown: EnvValidationError | null = null;
    try {
      env.parse({ env: {} });
    } catch (err) {
      if (err instanceof EnvValidationError) thrown = err;
    }
    expect(thrown?.errors[0]?.kind).toBe("missing");
  });

  it("reports invalid_type kind for type mismatch", () => {
    const env = defineEnv({ PORT: number() });
    let thrown: EnvValidationError | null = null;
    try {
      env.parse({ env: { PORT: "notanumber" } });
    } catch (err) {
      if (err instanceof EnvValidationError) thrown = err;
    }
    expect(thrown?.errors[0]?.kind).toBe("invalid_type");
  });
});

// ─── parseEnv ─────────────────────────────────────────────────────────────────

describe("parseEnv()", () => {
  it("is a shorthand for defineEnv().parse()", () => {
    const config = parseEnv(
      { HOST: string(), PORT: number().default(8080) },
      { env: { HOST: "localhost" } },
    );
    expect(config).toEqual({ HOST: "localhost", PORT: 8080 });
  });
});

// ─── optional and default ─────────────────────────────────────────────────────

describe("optional() and default()", () => {
  it("optional fields can be absent", () => {
    const env = defineEnv({
      LOG_LEVEL: string().optional(),
    });
    const config = env.parse({ env: {} });
    expect(config.LOG_LEVEL).toBeUndefined();
  });

  it("optional fields still parse if present", () => {
    const env = defineEnv({
      LOG_LEVEL: string().optional(),
    });
    const config = env.parse({ env: { LOG_LEVEL: "debug" } });
    expect(config.LOG_LEVEL).toBe("debug");
  });
});

// ─── validate() ───────────────────────────────────────────────────────────────

describe("validate()", () => {
  it("returns empty array on success", () => {
    const env = defineEnv({ PORT: number().default(3000) });
    expect(env.validate({ env: {} })).toEqual([]);
  });

  it("returns errors without throwing", () => {
    const env = defineEnv({ PORT: number(), API_KEY: string() });
    const errors = env.validate({ env: {} });
    expect(errors.length).toBe(2);
  });
});

// ─── group() ─────────────────────────────────────────────────────────────────

describe("group()", () => {
  it("parses group with prefix", () => {
    const env = defineEnv({
      db: group(
        {
          HOST: string(),
          PORT: number().default(5432),
          NAME: string(),
        },
        { prefix: "DB_" },
      ),
    });

    const config = env.parse({
      env: {
        DB_HOST: "localhost",
        DB_NAME: "mydb",
      },
    });

    expect(config.db).toEqual({ HOST: "localhost", PORT: 5432, NAME: "mydb" });
  });

  it("reports errors with full prefixed key", () => {
    const env = defineEnv({
      db: group({ HOST: string() }, { prefix: "DB_" }),
    });

    let thrown: EnvValidationError | null = null;
    try {
      env.parse({ env: {} });
    } catch (err) {
      if (err instanceof EnvValidationError) thrown = err;
    }

    expect(thrown?.errors[0]?.key).toBe("DB_HOST");
  });

  it("supports groups without prefix", () => {
    const env = defineEnv({
      mail: group({
        SMTP_HOST: string(),
        SMTP_PORT: number().default(587),
      }),
    });

    const config = env.parse({ env: { SMTP_HOST: "smtp.example.com" } });
    expect(config.mail).toEqual({ SMTP_HOST: "smtp.example.com", SMTP_PORT: 587 });
  });
});

// ─── env-specific schema ──────────────────────────────────────────────────────

describe("env-specific schema (group)", () => {
  it("overrides schema for specific NODE_ENV in group", () => {
    const env = defineEnv({
      db: group(
        {
          URL: url(),
        },
        {
          envSpecific: {
            test: {
              URL: url().default("sqlite:///:memory:"),
            },
          },
        },
      ),
    });

    const config = env.parse({ env: {}, nodeEnv: "test" });
    expect(config.db.URL).toBe("sqlite:///:memory:");
  });
});

describe("env-specific schema (top-level forEnv)", () => {
  it("applies top-level env overrides", () => {
    const env = defineEnv({
      LOG_LEVEL: string(),
    }).forEnv({
      development: {
        LOG_LEVEL: string().default("debug"),
      },
      production: {
        LOG_LEVEL: string().default("error"),
      },
    });

    const dev = env.parse({ env: {}, nodeEnv: "development" });
    const prod = env.parse({ env: {}, nodeEnv: "production" });

    expect(dev.LOG_LEVEL).toBe("debug");
    expect(prod.LOG_LEVEL).toBe("error");
  });
});

// ─── generateExample ──────────────────────────────────────────────────────────

describe("generateExample()", () => {
  it("generates .env.example content", () => {
    const env = defineEnv({
      PORT: number().default(3000).describe("Server port"),
      DATABASE_URL: url(),
      NODE_ENV: enumValidator(["development", "production"] as const),
    });

    const content = env.generateExample();
    expect(content).toContain("PORT=3000");
    expect(content).toContain("DATABASE_URL=");
    expect(content).toContain("NODE_ENV=");
  });

  it("omits comments when comments=false", () => {
    const env = defineEnv({ PORT: number().default(3000) });
    const content = env.generateExample({ comments: false });
    expect(content).not.toContain("#");
    expect(content).toContain("PORT=3000");
  });
});

// ─── introspect ───────────────────────────────────────────────────────────────

describe("introspect()", () => {
  it("returns correct fields", () => {
    const env = defineEnv({
      PORT: number().default(3000).describe("Server port"),
      API_KEY: string(),
    });

    const { fields } = env.introspect();
    expect(fields.length).toBe(2);

    const portField = fields.find((f) => f.key === "PORT");
    expect(portField?.type).toBe("number");
    expect(portField?.required).toBe(false);
    expect(portField?.default).toBe(3000);
    expect(portField?.description).toBe("Server port");

    const keyField = fields.find((f) => f.key === "API_KEY");
    expect(keyField?.required).toBe(true);
  });

  it("includes group fields with group name", () => {
    const env = defineEnv({
      db: group({ HOST: string() }, { prefix: "DB_" }),
    });

    const { fields } = env.introspect();
    const hostField = fields.find((f) => f.key === "DB_HOST");
    expect(hostField?.group).toBe("db");
  });
});

// ─── TypeScript type inference ────────────────────────────────────────────────

describe("TypeScript inference", () => {
  it("infers correct types from schema", () => {
    const env = defineEnv({
      PORT: number().default(3000),
      HOST: string(),
      DEBUG: boolean().optional(),
      NODE_ENV: enumValidator(["development", "production"] as const).default("development"),
    });

    const config = env.parse({
      env: { HOST: "localhost" },
    });

    // TypeScript should infer these types:
    const port: number = config.PORT;
    const host: string = config.HOST;
    const debug: boolean | undefined = config.DEBUG;
    const nodeEnv: "development" | "production" = config.NODE_ENV;

    expect(port).toBe(3000);
    expect(host).toBe("localhost");
    expect(debug).toBeUndefined();
    expect(nodeEnv).toBe("development");
  });
});

// ─── Email validation ─────────────────────────────────────────────────────────

describe("email validator in schema", () => {
  it("validates email in env schema", () => {
    const env = defineEnv({ ADMIN_EMAIL: email() });
    const config = env.parse({ env: { ADMIN_EMAIL: "admin@example.com" } });
    expect(config.ADMIN_EMAIL).toBe("admin@example.com");
  });

  it("fails on invalid email in schema", () => {
    const env = defineEnv({ ADMIN_EMAIL: email() });
    expect(() => env.parse({ env: { ADMIN_EMAIL: "not-an-email" } })).toThrow();
  });
});
