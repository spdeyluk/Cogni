// Cogni · shared Apple App Store Server API helpers
// ---------------------------------------------------------------------------
// Both apple-verify (client-initiated) and apple-webhook (Apple-initiated) need
// the same thing: given an originalTransactionId, ask Apple what the
// subscription's real status is. Neither trusts the payload it was handed.
// ---------------------------------------------------------------------------

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Read a JWS payload without verifying it. Callers must not trust the result
 *  for authorization — it is only used to pull out an identifier. */
// deno-lint-ignore no-explicit-any
export function decodeJws(jws: string): any | null {
  const parts = jws.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch {
    return null;
  }
}

// --- App Store Server API auth ---------------------------------------------
// Apple wants an ES256 JWT signed with the .p8 key from App Store Connect.

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function appStoreToken(): Promise<string> {
  const issuer = Deno.env.get("APPLE_ISSUER_ID") ?? "";
  const keyId = Deno.env.get("APPLE_KEY_ID") ?? "";
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID") ?? "";
  const pem = Deno.env.get("APPLE_PRIVATE_KEY") ?? "";
  if (!issuer || !keyId || !bundleId || !pem) {
    throw new Error("Apple App Store Server API secrets are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claims = {
    iss: issuer,
    iat: now,
    exp: now + 600, // Apple rejects anything over an hour; 10 min is plenty.
    aud: "appstoreconnect-v1",
    bid: bundleId,
  };
  const enc = new TextEncoder();
  const signingInput = `${bytesToB64url(enc.encode(JSON.stringify(header)))}.${
    bytesToB64url(enc.encode(JSON.stringify(claims)))
  }`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );
  return `${signingInput}.${bytesToB64url(sig)}`;
}

export interface AppleState {
  found: boolean;
  active: boolean;
  status: string;
  productId?: string;
  expiresAt?: number;
}

// Apple's numeric subscription statuses.
const STATUS_LABEL: Record<number, string> = {
  1: "active",
  2: "expired",
  3: "billing_retry",
  4: "grace_period",
  5: "revoked",
};
// Grace period still entitles the user; billing retry does not.
const ENTITLING = new Set([1, 4]);

async function query(host: string, originalTransactionId: string, token: string) {
  return await fetch(
    `https://${host}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

/** Authoritative subscription state, straight from Apple. Falls back to the
 *  sandbox host so TestFlight and sandbox purchases resolve without config. */
export async function appleSubscriptionState(
  originalTransactionId: string,
): Promise<AppleState> {
  const token = await appStoreToken();
  const preferSandbox = (Deno.env.get("APPLE_ENVIRONMENT") ?? "Production") === "Sandbox";
  const hosts = preferSandbox
    ? ["api.storekit-sandbox.itunes.apple.com", "api.storekit.itunes.apple.com"]
    : ["api.storekit.itunes.apple.com", "api.storekit-sandbox.itunes.apple.com"];

  for (const host of hosts) {
    const res = await query(host, originalTransactionId, token);
    if (res.status === 404) continue; // try the other environment
    if (!res.ok) throw new Error(`App Store Server API ${res.status}`);

    const body = await res.json();
    // Newest transaction across the returned groups wins.
    let best: { status: number; payload: Record<string, unknown> } | null = null;
    for (const group of body.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        const payload = decodeJws(item.signedTransactionInfo) ?? {};
        const expires = Number(payload.expiresDate ?? 0);
        const bestExpires = Number(best?.payload.expiresDate ?? -1);
        if (!best || expires > bestExpires) best = { status: item.status, payload };
      }
    }
    if (!best) continue;

    return {
      found: true,
      active: ENTITLING.has(best.status),
      status: STATUS_LABEL[best.status] ?? `unknown_${best.status}`,
      productId: best.payload.productId as string | undefined,
      expiresAt: Number(best.payload.expiresDate ?? 0) || undefined,
    };
  }
  return { found: false, active: false, status: "not_found" };
}
