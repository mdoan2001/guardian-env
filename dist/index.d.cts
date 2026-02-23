type ValidationSuccess<T> = {
    ok: true;
    value: T;
};
type ValidationFailure = {
    ok: false;
    error: string;
};
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
interface ValidatorMeta {
    readonly _type: string;
    readonly _required: boolean;
    readonly _default: unknown;
    readonly _description: string | undefined;
}
interface Validator<T> extends ValidatorMeta {
    parse(raw: string | undefined): ValidationResult<T>;
    optional(): Validator<T | undefined>;
    default(value: T): Validator<T>;
    describe(description: string): Validator<T>;
}
type FlatSchemaShape = Record<string, Validator<unknown>>;
interface GroupSchema {
    readonly _isGroup: true;
    readonly _prefix: string | undefined;
    readonly _envSpecific: EnvSpecificSchema | undefined;
    readonly shape: FlatSchemaShape;
}
type SchemaShape = Record<string, Validator<unknown> | GroupSchema>;
type EnvSpecificSchema = Record<string, FlatSchemaShape>;
type InferValidator<V> = V extends Validator<infer T> ? T : never;
type InferFlat<S extends FlatSchemaShape> = {
    [K in keyof S]: InferValidator<S[K]>;
};
type InferGroup<G extends GroupSchema> = InferFlat<G["shape"]>;
type InferSchema<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends GroupSchema ? InferGroup<S[K]> : S[K] extends Validator<unknown> ? InferValidator<S[K]> : never;
};
type ErrorKind = "missing" | "invalid_type" | "invalid_format" | "invalid_value";
interface EnvError {
    key: string;
    kind: ErrorKind;
    message: string;
    received: string | undefined;
    expected: string | undefined;
}
interface ParseOptions {
    /** Override the env source (default: process.env) */
    env?: Record<string, string | undefined>;
    /** Current environment name (for env-specific schemas) */
    nodeEnv?: string | undefined;
    /** Strip type metadata at runtime (production optimization) */
    stripTypes?: boolean | undefined;
    /** Exit process on validation error (default: true in CLI mode) */
    exitOnError?: boolean | undefined;
}

interface GroupOptions {
    /** Env variable prefix to strip from keys (e.g., "DB_" → key "HOST" reads "DB_HOST") */
    prefix?: string;
    /** Override schema per NODE_ENV value */
    envSpecific?: Record<string, FlatSchemaShape>;
}
declare function group<S extends FlatSchemaShape>(shape: S, options?: GroupOptions): GroupSchema & {
    shape: S;
};
declare class EnvGuardian<S extends SchemaShape> {
    private readonly _schema;
    private _globalEnvSpecific;
    constructor(schema: S);
    /**
     * Add top-level environment-specific overrides.
     * These are applied when the key is directly in the schema (not in a group).
     */
    forEnv(envSpecific: Record<string, FlatSchemaShape>): this;
    /**
     * Parse and validate environment variables.
     * Throws `EnvValidationError` on failure.
     */
    parse(options?: ParseOptions): InferSchema<S>;
    /**
     * Validate without throwing. Returns errors array or empty array.
     */
    validate(options?: ParseOptions): EnvError[];
    /**
     * Generate a .env.example file content from the schema.
     */
    generateExample(options?: {
        comments?: boolean;
        includeDefaults?: boolean;
    }): string;
    /**
     * Return a plain object describing the schema (useful for documentation generation).
     */
    introspect(): SchemaIntrospection;
}
interface IntrospectedField {
    key: string;
    group: string | undefined;
    type: string;
    required: boolean;
    default: unknown;
    description: string | undefined;
}
interface SchemaIntrospection {
    fields: IntrospectedField[];
}
/**
 * Define an environment variable schema.
 *
 * @example
 * const env = defineEnv({
 *   PORT: number().default(3000),
 *   DATABASE_URL: url(),
 *   NODE_ENV: enumValidator(["development", "production"]),
 * });
 *
 * export const config = env.parse();
 */
declare function defineEnv<S extends SchemaShape>(schema: S): EnvGuardian<S>;
/**
 * Quick one-shot parse — define schema and parse immediately.
 * Equivalent to `defineEnv(schema).parse(options)`.
 */
declare function parseEnv<S extends SchemaShape>(schema: S, options?: ParseOptions): InferSchema<S>;
/**
 * Print formatted validation errors to stderr.
 * Returns true if all valid, false if errors found.
 */
declare function checkEnv<S extends SchemaShape>(guard: EnvGuardian<S>, options?: ParseOptions & {
    source?: string;
}): boolean;

declare abstract class BaseValidator<T> implements Validator<T> {
    readonly _type: string;
    readonly _required: boolean;
    readonly _default: unknown;
    readonly _description: string | undefined;
    constructor(type: string, required?: boolean, defaultValue?: unknown, description?: string | undefined);
    abstract parse(raw: string | undefined): ValidationResult<T>;
    optional(): Validator<T | undefined>;
    default(value: T): Validator<T>;
    describe(description: string): Validator<T>;
}
declare class CustomValidator<T> extends BaseValidator<T> {
    private readonly _fn;
    constructor(fn: (raw: string) => ValidationResult<T>, typeName?: string);
    parse(raw: string | undefined): ValidationResult<T>;
}

declare class StringValidator extends BaseValidator<string> {
    private readonly _minLength;
    private readonly _maxLength;
    private readonly _pattern;
    constructor(options?: {
        minLength?: number | undefined;
        maxLength?: number | undefined;
        pattern?: RegExp | undefined;
        required?: boolean | undefined;
        defaultValue?: string | undefined;
        description?: string | undefined;
    });
    parse(raw: string | undefined): ValidationResult<string>;
    min(length: number): StringValidator;
    max(length: number): StringValidator;
    matches(pattern: RegExp): StringValidator;
}
declare function string(): StringValidator;

declare class NumberValidator extends BaseValidator<number> {
    private readonly _min;
    private readonly _max;
    private readonly _integer;
    constructor(options?: {
        min?: number | undefined;
        max?: number | undefined;
        integer?: boolean | undefined;
        required?: boolean | undefined;
        defaultValue?: number | undefined;
        description?: string | undefined;
    });
    parse(raw: string | undefined): ValidationResult<number>;
    min(value: number): NumberValidator;
    max(value: number): NumberValidator;
    int(): NumberValidator;
    port(): NumberValidator;
}
declare function number(): NumberValidator;

declare class BooleanValidator extends BaseValidator<boolean> {
    constructor(options?: {
        required?: boolean;
        defaultValue?: boolean;
        description?: string;
    });
    parse(raw: string | undefined): ValidationResult<boolean>;
}
declare function boolean(): BooleanValidator;

declare class UrlValidator extends BaseValidator<string> {
    private readonly _protocols;
    constructor(options?: {
        protocols?: string[] | undefined;
        required?: boolean | undefined;
        defaultValue?: string | undefined;
        description?: string | undefined;
    });
    parse(raw: string | undefined): ValidationResult<string>;
    protocols(...allowed: string[]): UrlValidator;
}
declare function url(): UrlValidator;

declare class EmailValidator extends BaseValidator<string> {
    constructor(options?: {
        required?: boolean;
        defaultValue?: string;
        description?: string;
    });
    parse(raw: string | undefined): ValidationResult<string>;
}
declare function email(): EmailValidator;

declare class EnumValidator<T extends string> extends BaseValidator<T> {
    private readonly _values;
    constructor(values: readonly T[], options?: {
        required?: boolean;
        defaultValue?: T;
        description?: string;
    });
    parse(raw: string | undefined): ValidationResult<T>;
    values(): readonly T[];
}
declare function enumValidator<T extends string>(values: readonly T[]): EnumValidator<T>;

declare function formatErrors(errors: EnvError[], source?: string): string;
declare function formatSuccess(count: number, source?: string): string;
declare class EnvValidationError extends Error {
    readonly errors: EnvError[];
    constructor(errors: EnvError[], source?: string);
}

export { BooleanValidator, CustomValidator, EmailValidator, EnumValidator, type EnvError, EnvGuardian, EnvValidationError, type ErrorKind, type FlatSchemaShape, type GroupOptions, type GroupSchema, type InferFlat, type InferSchema, type InferValidator, type IntrospectedField, NumberValidator, type ParseOptions, type SchemaIntrospection, type SchemaShape, StringValidator, UrlValidator, type ValidationFailure, type ValidationResult, type ValidationSuccess, type Validator, type ValidatorMeta, boolean, checkEnv, defineEnv, email, enumValidator, formatErrors, formatSuccess, group, number, parseEnv, string, url };
