// Web bundle. The browser used to load src/app/main.js and the whole src/ tree
// as raw ES modules, comments and all, so anyone could pull the exercise and
// test mechanics out of the site in one go. Since 2026-11-27 the server only
// serves this build: one minified bundle with local names mangled, comments
// stripped and no source map. The source tree itself is never served.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";

const root = process.cwd();
const outDir = join(root, "public", "build");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: { app: join(root, "src", "app", "main.js") },
  bundle: true,
  format: "esm",
  splitting: true,          // the three.js globe stays a lazy chunk
  target: ["es2022", "safari16"],
  outdir: outDir,
  entryNames: "[name]",
  chunkNames: "chunk-[hash]",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  metafile: true,
  logLevel: "warning"
});

const files = Object.entries(result.metafile.outputs).map(([file, meta]) => `${file.replace(/^public\//, "")} ${(meta.bytes / 1024).toFixed(0)} KB`);
console.log(`Built web bundle: ${files.join(", ")}`);
