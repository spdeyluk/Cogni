// Cogni web host.
//
// Accounts, cloud sync, social and feedback all live in Supabase now (see
// supabase/schema.sql), so this process no longer has an API surface: it only
// serves the static web app. That deliberately removes password storage, the
// session secret, and the lead/feedback PII files from this server entirely.
//
// The one piece of custom backend that survived the migration is the Brevo
// lead sync, which runs as a Supabase Edge Function (supabase/functions/lead-sync).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const publicDir = join(root, "public");
const srcDir = join(root, "src");
const nodeModulesDir = join(root, "node_modules");
const port = Number(process.env.PORT || 4283);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"]
]);

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store"
};

// HSTS is only meaningful over HTTPS, so it stays opt-in via COOKIE_SECURE,
// which is set on the HTTPS deploy.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  ...(process.env.COOKIE_SECURE === "1"
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
    : {})
};

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  // The web build loads raw ES modules from /src and /node_modules.
  if (pathname.startsWith("/src/") || pathname.startsWith("/node_modules/")) {
    return join(root, normalize(pathname));
  }
  // Standalone docs site.
  if (pathname === "/docs") {
    return join(publicDir, "docs.html");
  }
  // Legal pages.
  if (pathname === "/privacy") return join(publicDir, "privacy.html");
  if (pathname === "/terms" || pathname === "/user-agreement") return join(publicDir, "terms.html");
  // Client-side routes (e.g. /exercises, /profile) carry no file extension —
  // serve the SPA shell so deep links and refreshes land on the app, which then
  // routes to the right section. Real assets always have an extension.
  if (pathname === "/" || pathname === "/iq" || !extname(pathname)) {
    return join(publicDir, "index.html");
  }
  return join(publicDir, normalize(pathname));
}

const server = createServer(async (request, response) => {
  response.on("error", () => {});

  try {
    const filePath = resolveRequestPath(request.url);
    // Containment check: a decoded "../" must not escape the served roots.
    if (!filePath.startsWith(publicDir) && !filePath.startsWith(srcDir) && !filePath.startsWith(nodeModulesDir)) {
      response.writeHead(403, securityHeaders);
      response.end("Forbidden");
      return;
    }

    const raw = await readFile(filePath);
    const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream";
    // Nothing was compressed before, so the web build shipped its JS and CSS at
    // full size — main.js, styles.css and the Supabase client alone were about
    // 1.7 MB of text. gzip takes roughly three quarters off that.
    //
    // TTF is included because it is an uncompressed container and gzips well;
    // woff2 would be better still (it is brotli internally) but that needs a
    // conversion step. PNG, JPEG, WebP and woff2 are already compressed, so
    // running them through gzip would only burn CPU.
    const compressible = /^(text\/|font\/ttf|application\/(javascript|json|manifest))/.test(contentType);
    const wantsGzip = /\bgzip\b/.test(request.headers["accept-encoding"] || "");
    const body = compressible && wantsGzip && raw.length > 1024 ? gzipSync(raw) : raw;
    response.writeHead(200, {
      "Content-Type": contentType,
      ...(body === raw ? {} : { "Content-Encoding": "gzip" }),
      "Vary": "Accept-Encoding",
      ...securityHeaders,
      ...noCacheHeaders
    });
    response.end(body);
  } catch {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
  }
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, () => {
  console.log(`Cogni web app running at http://localhost:${port}`);
});
