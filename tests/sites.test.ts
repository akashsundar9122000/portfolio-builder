import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// in-memory stand-ins for Upstash Redis and Cloudflare KV
const kv = new Map<string, string>();
const zsets = new Map<string, Map<string, number>>();
const blobs = new Map<string, Uint8Array | string>();
const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;

vi.mock("@/lib/server/limits", () => ({
  hasRedis: () => true,
  redis: async ([cmd, ...a]: (string | number)[]) => {
    const [k] = a as string[];
    switch (cmd) {
      case "GET": return kv.get(k) ?? null;
      case "SET": kv.set(k, String(a[1])); return "OK";
      case "MGET": return (a as string[]).map((key) => kv.get(key) ?? null);
      case "ZADD": zset(k).set(String(a[2]), Number(a[1])); return 1;
      case "ZRANGE": return [...zset(k).entries()].sort((x, y) => y[1] - x[1]).map(([m]) => m);
      default: throw new Error(`unmocked ${cmd}`);
    }
  },
}));
vi.mock("@/lib/server/kv", () => ({
  kvPut: async (key: string, body: Uint8Array | string) => { blobs.set(key, body); },
  kvGet: async (key: string) => (blobs.has(key) ? new TextEncoder().encode(String(blobs.get(key))).buffer : null),
  kvDelete: async (key: string) => { blobs.delete(key); },
  KvMissing: class extends Error {},
}));

const sites = await import("@/lib/server/sites");
const { sampleById } = await import("@/lib/builder/samples");
const { toSlug, slugProblem, checkSlug, publish, resolveSlug, storeAsset, ensureSite, unpublish, siteForOwner } = sites;

const draft = () => sampleById("developer")!.draft();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeEach(() => {
  kv.clear();
  zsets.clear();
  blobs.clear();
});

describe("site names", () => {
  it("turns what people type into a clean address", () => {
    expect(toSlug("  Priya  Nair!! ")).toBe("priya-nair");
    expect(toSlug("José Álvarez")).toBe("jose-alvarez");
  });
  it("rejects reserved, blocked and malformed names", () => {
    expect(slugProblem("admin")).toMatch(/reserved/);
    expect(slugProblem("paypal-login")).toMatch(/isn’t allowed/);
    expect(slugProblem("ab")).toMatch(/3–40/);
    expect(slugProblem("priya-nair")).toBeNull();
  });
  it("lets only the owner reuse a taken name", async () => {
    await publish("a@x.com", { slug: "priya", draft: draft(), assets: { covers: {} } });
    expect(await checkSlug("priya", "b@x.com")).toMatchObject({ ok: false });
    expect(await checkSlug("priya", "a@x.com")).toMatchObject({ ok: true });
  });
});

describe("publishing", () => {
  it("renders the page on the server with its assets", async () => {
    const site = await ensureSite("a@x.com", "A");
    const file = await storeAsset(site, JPEG, "jpg");
    const { site: live, first } = await publish("a@x.com", { slug: "arjun", draft: draft(), assets: { portrait: { file, kind: "framed" }, covers: {} } });
    expect(first).toBe(true);
    const html = String(blobs.get(`h:${live.id}`));
    expect(html).toContain(`/s/${live.id}/${file}`);
    expect(html).toContain("Arjun Mehta");
    expect((await resolveSlug("arjun"))?.current).toBe(true);
  });

  it("refuses files that aren't what they claim", async () => {
    const site = await ensureSite("a@x.com", "A");
    await expect(storeAsset(site, new TextEncoder().encode("<script>"), "jpg")).rejects.toThrow(/doesn’t look like/);
    await expect(storeAsset(site, JPEG, "html")).rejects.toThrow(/can’t be published/);
  });

  it("renames, and the old address still resolves (to redirect)", async () => {
    await publish("a@x.com", { slug: "old-name", draft: draft(), assets: { covers: {} } });
    const { renamed } = await publish("a@x.com", { slug: "new-name", draft: draft(), assets: { covers: {} } });
    expect(renamed).toBe(true);
    expect(await resolveSlug("old-name")).toMatchObject({ current: false, site: { slug: "new-name" } });
    expect(await checkSlug("old-name", "b@x.com")).toMatchObject({ ok: false });
  });

  it("keeps one site per email", async () => {
    await publish("a@x.com", { slug: "one", draft: draft(), assets: { covers: {} } });
    await publish("a@x.com", { slug: "one", draft: draft(), assets: { covers: {} } });
    expect(zset("ff:sites").size).toBe(1);
  });
});

describe("taking down", () => {
  it("owner unpublish deletes files; they can publish again", async () => {
    const { site } = await publish("a@x.com", { slug: "mine", draft: draft(), assets: { covers: {} } });
    await unpublish(site, "owner");
    expect(blobs.has(`h:${site.id}`)).toBe(false);
    expect((await siteForOwner("a@x.com"))?.status).toBe("unpublished");
    expect((await publish("a@x.com", { slug: "mine", draft: draft(), assets: { covers: {} } })).site.status).toBe("live");
  });

  it("an admin take-down can't be republished", async () => {
    const { site } = await publish("a@x.com", { slug: "bad", draft: draft(), assets: { covers: {} } });
    await unpublish(site, "admin", "Phishing");
    await expect(publish("a@x.com", { slug: "bad", draft: draft(), assets: { covers: {} } })).rejects.toThrow(/taken down/);
  });
});
