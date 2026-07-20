import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = process.cwd();

// Minimal .env loader (no dependency): KEY=value lines, # comments.
try {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
} catch {
  // No .env file; env vars may still be set by the host.
}
const publicDir = join(root, "public");
const srcDir = join(root, "src");
const nodeModulesDir = join(root, "node_modules");
// DATA_DIR lets a host mount a persistent disk (leads survive redeploys).
const dataDir = process.env.DATA_DIR || join(root, ".data");
const socialDbPath = join(dataDir, "social.json");
const port = Number(process.env.PORT || 4283);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store"
};

const apiHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  ...noCacheHeaders
};

function normalizeHandle(value) {
  const raw = String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  return cleaned ? `@${cleaned}` : "";
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function loadSocialDb() {
  try {
    return JSON.parse(await readFile(socialDbPath, "utf8"));
  } catch {
    return { users: {}, requests: [] };
  }
}

async function saveSocialDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(socialDbPath, JSON.stringify(db, null, 2));
}

const leadsPath = join(dataDir, "leads.json");

// Brevo (email + SMS list) sync: every captured lead is upserted as a
// contact, keyed by email, with the phone as the SMS attribute and the IQ
// score attached for segmenting. leads.json stays the local backup.
const brevoApiKey = process.env.BREVO_API_KEY || "";
const brevoListId = Number(process.env.BREVO_LIST_ID) || null;

// Brevo only accepts internationally formatted mobile numbers. Normalize
// what people type; return null when there's no usable country code.
function normalizeSmsNumber(raw) {
  let digits = String(raw ?? "").replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!/^\+[0-9]{8,15}$/.test(digits)) return null;
  return digits;
}

async function postBrevoContact(body) {
  const response = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.ok || response.status === 204) return { ok: true };
  return { ok: false, status: response.status, detail: await response.text() };
}

async function syncLeadToBrevo(lead) {
  if (!brevoApiKey) return;
  const sms = normalizeSmsNumber(lead.phone);
  if (!lead.email && !sms) return;
  const attributes = { LEAD_SOURCE: lead.source ?? "web" };
  if (sms) attributes.SMS = sms;
  if (Number.isFinite(lead.score)) attributes.IQ_SCORE = lead.score;
  const body = {
    updateEnabled: true,
    attributes,
    ...(lead.email ? { email: lead.email } : {}),
    ...(brevoListId ? { listIds: [brevoListId] } : {})
  };
  let result = await postBrevoContact(body);
  if (!result.ok && attributes.SMS) {
    // A malformed or already-taken SMS number must not lose the email lead.
    delete attributes.SMS;
    result = await postBrevoContact(body);
  }
  if (!result.ok) console.error(`[brevo] sync failed (${result.status}): ${result.detail}`);
}

function leadsCsv(leads) {
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((lead) =>
    [lead.name, lead.email, lead.phone, lead.score, lead.source, lead.createdAt].map(quote).join(","));
  return ["name,email,phone,score,source,createdAt", ...rows].join("\n");
}

async function loadLeads() {
  try {
    const leads = JSON.parse(await readFile(leadsPath, "utf8"));
    return Array.isArray(leads) ? leads : [];
  } catch {
    return [];
  }
}

async function saveLeads(leads) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(leadsPath, JSON.stringify(leads, null, 2));
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...apiHeaders
  });
  response.end(JSON.stringify(data));
}

async function handleApiRequest(request, response, url) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, apiHeaders);
    response.end();
    return true;
  }

  // App-drop waitlist: the IQ funnel posts the same lead twice (email gate,
  // then phone gate), so posts carrying a known id merge into one row.
  if (url.pathname === "/api/leads" && request.method === "POST") {
    const body = await readJsonBody(request);
    const id = String(body.id ?? "").trim().slice(0, 60);
    const name = String(body.name ?? "").trim().slice(0, 80);
    const phone = String(body.phone ?? "").trim().slice(0, 40);
    const email = String(body.email ?? "").trim().slice(0, 120);
    if (!phone && !email) {
      sendJson(response, 400, { error: "A phone number or email is required." });
      return true;
    }
    const score = Number.isFinite(body.score) ? Math.round(body.score) : null;
    const leads = await loadLeads();
    const existing = id ? leads.find((lead) => lead.id === id) : null;
    let synced = existing;
    if (existing) {
      if (name) existing.name = name;
      if (phone) existing.phone = phone;
      if (email) existing.email = email;
      if (score !== null) existing.score = score;
      existing.updatedAt = new Date().toISOString();
    } else {
      synced = {
        id: id || `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        phone,
        email,
        score,
        source: String(body.source ?? "web").slice(0, 40),
        createdAt: new Date().toISOString()
      };
      leads.push(synced);
    }
    await saveLeads(leads);
    syncLeadToBrevo(synced).catch((error) => console.error("[brevo] sync error:", error.message));
    sendJson(response, 200, { ok: true, count: leads.length });
    return true;
  }

  if (url.pathname === "/api/leads.csv" && request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=mindcare-leads.csv",
      ...noCacheHeaders
    });
    response.end(leadsCsv(await loadLeads()));
    return true;
  }

  if (url.pathname === "/api/leads" && request.method === "GET") {
    sendJson(response, 200, { leads: await loadLeads() });
    return true;
  }

  if (url.pathname === "/api/social/profile" && request.method === "POST") {
    const body = await readJsonBody(request);
    const handle = normalizeHandle(body.handle);
    if (!handle) {
      sendJson(response, 400, { error: "Enter a valid @ username." });
      return true;
    }
    const db = await loadSocialDb();
    db.users[handle] = {
      handle,
      avatarInitial: String(body.avatarInitial ?? "").slice(0, 2),
      avatarImage: String(body.avatarImage ?? "").startsWith("data:image/") ? body.avatarImage : "",
      updatedAt: new Date().toISOString()
    };
    await saveSocialDb(db);
    sendJson(response, 200, { user: db.users[handle] });
    return true;
  }

  if (url.pathname === "/api/friend-requests" && request.method === "GET") {
    const handle = normalizeHandle(url.searchParams.get("handle"));
    if (!handle) {
      sendJson(response, 400, { error: "Missing handle." });
      return true;
    }
    const db = await loadSocialDb();
    const relevant = db.requests.filter((requestItem) => requestItem.fromHandle === handle || requestItem.toHandle === handle);
    sendJson(response, 200, {
      incoming: relevant.filter((requestItem) => requestItem.toHandle === handle && requestItem.status === "pending"),
      outgoing: relevant.filter((requestItem) => requestItem.fromHandle === handle && requestItem.status === "pending"),
      friends: relevant.filter((requestItem) => requestItem.status === "accepted")
    });
    return true;
  }

  if (url.pathname === "/api/friend-requests" && request.method === "POST") {
    const body = await readJsonBody(request);
    const fromHandle = normalizeHandle(body.fromHandle);
    const toHandle = normalizeHandle(body.toHandle);
    if (!fromHandle || !toHandle) {
      sendJson(response, 400, { error: "Enter a valid @ username." });
      return true;
    }
    if (fromHandle === toHandle) {
      sendJson(response, 400, { error: "You cannot add yourself." });
      return true;
    }
    const db = await loadSocialDb();
    if (!db.users[toHandle]) {
      sendJson(response, 404, { error: "That @ username is not registered yet." });
      return true;
    }
    const existing = db.requests.find((item) =>
      [item.fromHandle, item.toHandle].includes(fromHandle) &&
      [item.fromHandle, item.toHandle].includes(toHandle) &&
      item.status !== "declined"
    );
    if (existing) {
      sendJson(response, 200, { request: existing, duplicate: true });
      return true;
    }
    const requestItem = {
      id: `friend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fromHandle,
      toHandle,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    db.requests.unshift(requestItem);
    await saveSocialDb(db);
    sendJson(response, 201, { request: requestItem });
    return true;
  }

  if (url.pathname === "/api/friend-requests/respond" && request.method === "POST") {
    const body = await readJsonBody(request);
    const handle = normalizeHandle(body.handle);
    const action = body.action === "accept" ? "accepted" : "declined";
    const db = await loadSocialDb();
    const requestItem = db.requests.find((item) => item.id === body.requestId && item.toHandle === handle);
    if (!requestItem) {
      sendJson(response, 404, { error: "Friend request not found." });
      return true;
    }
    requestItem.status = action;
    requestItem.respondedAt = new Date().toISOString();
    await saveSocialDb(db);
    sendJson(response, 200, { request: requestItem });
    return true;
  }

  return false;
}

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  if (pathname.startsWith("/src/")) {
    return join(root, normalize(pathname));
  }

  if (pathname.startsWith("/node_modules/")) {
    return join(root, normalize(pathname));
  }

  if (pathname === "/iq") {
    return join(publicDir, "index.html");
  }
  if (pathname === "/") {
    return join(publicDir, "index.html");
  }

  return join(publicDir, normalize(pathname));
}

const server = createServer(async (request, response) => {
  response.on("error", () => {});

  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (!(await handleApiRequest(request, response, url))) sendJson(response, 404, { error: "Not found" });
      return;
    }

    const filePath = resolveRequestPath(request.url);
    if (!filePath.startsWith(publicDir) && !filePath.startsWith(srcDir) && !filePath.startsWith(nodeModulesDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
      ...noCacheHeaders
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
