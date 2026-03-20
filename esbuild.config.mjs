import esbuild from "esbuild";
import { builtinModules } from "module";

const isProd = process.env.NODE_ENV === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    ...builtinModules.flatMap((m) => [m, `node:${m}`]),
  ],
  format: "cjs",
  platform: "node",
  target: "es2020",
  outfile: "main.js",
  sourcemap: !isProd,
  minify: isProd,
  logLevel: "info",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
