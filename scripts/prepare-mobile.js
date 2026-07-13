import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";

const root = process.cwd();
const outDir = join(root, "mobile-www");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(join(root, "public"), outDir, { recursive: true });
await cp(join(root, "src"), join(outDir, "src"), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src", "app", "main.js")],
  bundle: true,
  format: "iife",
  target: ["safari15"],
  outfile: join(outDir, "app-bundle.js"),
  logLevel: "silent"
});

const indexPath = join(outDir, "index.html");
const indexHtml = await readFile(indexPath, "utf8");
await writeFile(
  indexPath,
  indexHtml.replace(
    /<script type="module" src="src\/app\/main\.js(?:\?([^"]*))?"><\/script>/,
    (_match, version) => `<script src="app-bundle.js${version ? `?${version}` : ""}"></script>`
  )
);

console.log(`Prepared Capacitor web assets in ${outDir}`);
