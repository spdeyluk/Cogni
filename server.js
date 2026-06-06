import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const publicDir = join(root, "public");
const srcDir = join(root, "src");
const nodeModulesDir = join(root, "node_modules");
const port = Number(process.env.PORT || 4283);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  if (pathname.startsWith("/src/")) {
    return join(root, normalize(pathname));
  }

  if (pathname.startsWith("/node_modules/")) {
    return join(root, normalize(pathname));
  }

  if (pathname === "/") {
    return join(publicDir, "index.html");
  }

  return join(publicDir, normalize(pathname));
}

const server = createServer(async (request, response) => {
  response.on("error", () => {});

  try {
    const filePath = resolveRequestPath(request.url);
    if (!filePath.startsWith(publicDir) && !filePath.startsWith(srcDir) && !filePath.startsWith(nodeModulesDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(port, () => {
  console.log(`Cognitive performance web app running at http://localhost:${port}`);
});
