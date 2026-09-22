import "server-only";
import { env } from "./env";

/**
 * Cloudflare Workers KV over its REST API — where published portfolios
 * live (free plan: 1 GB, 1,000 writes and 100,000 reads a day, 25 MiB per
 * value). Only the server talks to it; the token never reaches a browser.
 */

export const hasKv = () => Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CF_KV_NAMESPACE_ID && env.CF_KV_API_TOKEN);

const base = () => `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${env.CF_KV_NAMESPACE_ID}`;
const auth = () => ({ Authorization: `Bearer ${env.CF_KV_API_TOKEN}` });
const url = (key: string) => `${base()}/values/${encodeURIComponent(key)}`;

export class KvMissing extends Error {
  constructor() {
    super("Publishing needs Cloudflare KV — set CLOUDFLARE_ACCOUNT_ID, CF_KV_NAMESPACE_ID and CF_KV_API_TOKEN.");
  }
}

function need() {
  if (!hasKv()) throw new KvMissing();
}

export async function kvPut(key: string, body: Uint8Array | string): Promise<void> {
  need();
  const res = await fetch(url(key), { method: "PUT", headers: auth(), body: typeof body === "string" ? body : Buffer.from(body), cache: "no-store" });
  if (!res.ok) throw new Error(`Site storage write failed (${res.status})`);
}

export async function kvGet(key: string): Promise<ArrayBuffer | null> {
  need();
  const res = await fetch(url(key), { headers: auth(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Site storage read failed (${res.status})`);
  return res.arrayBuffer();
}

export async function kvDelete(key: string): Promise<void> {
  need();
  const res = await fetch(url(key), { method: "DELETE", headers: auth(), cache: "no-store" });
  if (!res.ok && res.status !== 404) throw new Error(`Site storage delete failed (${res.status})`);
}
