import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "providers/index": "src/providers/index.ts",
    "selectors/index": "src/selectors/index.ts",
    "encoders/index": "src/encoders/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  platform: "node",
  shims: false,
  external: ["@btc-stamps/types"],
  noExternal: ["bitcoinjs-lib", "ecpair", "tiny-secp256k1", "varuint-bitcoin"],
});
