// Magic-link auth: an admin mints a short-lived link for a technician;
// opening it exchanges the link for a long-lived device token that the
// frontend stores and sends as `Authorization: Bearer <deviceToken>` from
// then on.
//
// Both tokens are self-verifying (HMAC-signed JSON payloads), not looked up
// from storage: a Cloudflare Worker runs as many separate isolate instances
// across the network, so an in-memory Map only ever exists inside whichever
// single instance handled that request -- a mint and a redeem can easily
// land on two different instances seconds apart, which is exactly what made
// the old in-memory magic-link store fail in production. Signing instead of
// storing means there's nothing to lose: checking a token is a local
// signature check, valid on every instance, with no lookup or network call.
//
// Trade-off: the magic link is valid for its full 15-minute window no
// matter how many times it's opened, rather than strictly once. For an
// internal crew tool that's an acceptable trade for needing zero extra
// infrastructure (no KV, no Durable Object).

const MAGIC_LINK_TTL_MS = 15 * 60_000;

type Payload = { kind: 'magic'; name: string; exp: number } | { kind: 'device'; name: string };

// Only hit if AUTH_SECRET isn't configured (local dev without a .env entry).
// Real deployments must set a real secret -- see getAuthSecret below.
const DEV_FALLBACK_SECRET = 'chalkboard-dev-insecure-secret-do-not-use-in-prod';
let warnedMissingSecret = false;

export function getAuthSecret(env: any): string {
  const secret = env?.AUTH_SECRET;
  if (secret) return secret;
  if (!warnedMissingSecret) {
    console.warn('AUTH_SECRET not set -- tokens are signed with an insecure dev fallback. Set AUTH_SECRET (wrangler secret put AUTH_SECRET, or in worker/.env for dev-node) before deploying.');
    warnedMissingSecret = true;
  }
  return DEV_FALLBACK_SECRET;
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function sign(payload: Payload, secret: string): Promise<string> {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(encoded));
  return `${encoded}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verify(token: string, secret: string): Promise<Payload | undefined> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return undefined;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(sig), new TextEncoder().encode(encoded));
    if (!valid) return undefined;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
  } catch {
    return undefined;
  }
}

export function createMagicLink(techName: string, secret: string): Promise<string> {
  return sign({ kind: 'magic', name: techName, exp: Date.now() + MAGIC_LINK_TTL_MS }, secret);
}

export async function redeemMagicLink(token: string, secret: string): Promise<{ techName: string } | null> {
  const payload = await verify(token, secret);
  if (!payload || payload.kind !== 'magic') return null;
  if (Date.now() > payload.exp) return null;
  return { techName: payload.name };
}

export function signDeviceToken(techName: string, secret: string): Promise<string> {
  return sign({ kind: 'device', name: techName }, secret);
}

export async function resolveDeviceToken(token: string, secret: string): Promise<string | undefined> {
  const payload = await verify(token, secret);
  return payload?.kind === 'device' ? payload.name : undefined;
}
