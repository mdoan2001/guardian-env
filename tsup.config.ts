import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
    external: ["picocolors"],
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
    target: "es2022",
    outDir: "dist",
  },
]);
