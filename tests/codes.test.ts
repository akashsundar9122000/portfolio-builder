import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// an in-memory stand-in for the handful of Redis commands lib/server/codes uses
const kv = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const zsets = new Map<string, Map<string, number>>();
const set = (k: string) => sets.get(k) ?? sets.set(k, new Set()).get(k)!;
const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;

vi.mock("@/lib/server/limits", () => ({
  hasRedis: () => true,
  redis: async ([cmd, ...a]: (string | number)[]) => {
    const [k] = a as string[];
    switch (cmd) {
      case "GET": return kv.get(k) ?? null;
      case "SET": kv.set(k, String(a[1])); return "OK";
      case "DEL": { let n = 0; for (const key of a as string[]) n += Number(kv.delete(key)); return n; }
      case "INCR": { const n = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(n)); return n; }
      case "EXPIRE": return 1;
      case "MGET": return (a as string[]).map((key) => kv.get(key) ?? null);
      case "SADD": { const s = set(k); const had = s.has(String(a[1])); s.add(String(a[1])); return had ? 0 : 1; }
      case "SISMEMBER": return set(k).has(String(a[1])) ? 1 : 0;
      case "SMEMBERS": return [...set(k)];
      case "ZADD": zset(k).set(String(a[2]), Number(a[1])); return 1;
      case "ZREM": return Number(zset(k).delete(String(a[1])));
      case "ZREMRANGEBYSCORE": return 0;
      case "ZRANGE": return [...zset(k).entries()].sort((x, y) => y[1] - x[1]).map(([m]) => m);
      default: throw new Error(`unmocked ${cmd}`);
    }
  },
}));

const codes = await import("@/lib/server/codes");
const { createRequest, issueCode, checkLogin, recordDownload, previewCode, rejectRequest, revokeCode, adminRevoke, listRequests, normalCode, isCodeShape, generateCode } = codes;

async function requestAndIssue(email = "Ada@Example.com", ip = "1.1.1.1") {
  const r = await createRequest({ name: "Ada", email, reason: "", ip });
  if (!r.ok) throw new Error(r.reason);
  return issueCode(r.request.id, await previewCode(), "");
}

beforeEach(() => {
  kv.clear();
  sets.clear();
  zsets.clear();
});

describe("code format", () => {
  it("generates FF-XXXX-XXXX without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(isCodeShape(c)).toBe(true);
      expect(c.slice(3)).not.toMatch(/[01OILU]/);
    }
  });
  it("normalises how people type codes", () => {
    expect(normalCode(" ff abcd efgh ")).toBe("FF-ABCD-EFGH");
    expect(normalCode("ffabcdefgh")).toBe("FF-ABCD-EFGH");
    expect(normalCode("my-master")).toBe("MY-MASTER");
  });
});

describe("issuing", () => {
  it("binds the code to the email and lets that email sign in", async () => {
    const { code } = await requestAndIssue();
    expect(code.email).toBe("ada@example.com");
    expect((await checkLogin("ADA@example.com ", code.code.toLowerCase())).ok).toBe(true);
    expect(await checkLogin("someone@else.com", code.code)).toEqual({ ok: false, reason: "invalid" });
    expect(await checkLogin("ada@example.com", "FF-2222-2222")).toEqual({ ok: false, reason: "invalid" });
  });

  it("never reuses a code, even if the previewed one was taken meanwhile", async () => {
    const r = await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "1" });
    if (!r.ok) throw new Error();
    set("ff:issued").add("FF-AAAA-BBBB");
    const { code } = await issueCode(r.request.id, "FF-AAAA-BBBB", "");
    expect(code.code).not.toBe("FF-AAAA-BBBB");
    expect(set("ff:issued").has(code.code)).toBe(true);
  });

  it("can't issue twice for one request, or after rejecting", async () => {
    const { request } = await requestAndIssue();
    await expect(issueCode(request.id, generateCode(), "")).rejects.toThrow(/already sent/);
    const r2 = await createRequest({ name: "Bo", email: "bo@example.com", reason: "", ip: "2" });
    if (!r2.ok) throw new Error();
    await rejectRequest(r2.request.id, "Sorry");
    await expect(issueCode(r2.request.id, generateCode(), "")).rejects.toThrow(/already rejected/);
  });

  it("expires after 7 days", async () => {
    const { code } = await requestAndIssue();
    vi.useFakeTimers({ now: code.expiresAt + 1 });
    expect(await checkLogin("ada@example.com", code.code)).toEqual({ ok: false, reason: "expired" });
    vi.useRealTimers();
  });

  it("revoked codes stop working", async () => {
    const { code } = await requestAndIssue();
    await revokeCode(code.code);
    expect(await checkLogin("ada@example.com", code.code)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("admin revoke", () => {
  it("revokes an active code for good, keeps the reason, and frees the email", async () => {
    const { code } = await requestAndIssue();
    const r = await adminRevoke(code.code, "  Shared publicly  ");
    expect(r.status).toBe("revoked");
    expect(r.revokeReason).toBe("Shared publicly");
    expect(r.revokedAt).toBeTypeOf("number");
    expect(await checkLogin("ada@example.com", code.code)).toEqual({ ok: false, reason: "revoked" });
    // no way back: revoking again fails, and a new request is allowed
    await expect(adminRevoke(code.code, "")).rejects.toThrow(/already revoked/);
    expect((await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "7" })).ok).toBe(true);
  });

  it("refuses codes that are already used", async () => {
    const { code } = await requestAndIssue();
    await recordDownload(code.code, "zip");
    await recordDownload(code.code, "html");
    await expect(adminRevoke(code.code, "")).rejects.toThrow(/already used/);
  });
});

describe("single portfolio", () => {
  it("is used up only after both formats are downloaded", async () => {
    const { code } = await requestAndIssue();
    expect((await recordDownload(code.code, "zip")).burned).toBe(false);
    expect((await recordDownload(code.code, "zip")).burned).toBe(false); // same format again is free
    expect((await checkLogin("ada@example.com", code.code)).ok).toBe(true);
    expect((await recordDownload(code.code, "html")).burned).toBe(true);
    expect(await checkLogin("ada@example.com", code.code)).toEqual({ ok: false, reason: "used" });
  });

  it("frees the email for a new request once the code is used", async () => {
    const { code } = await requestAndIssue();
    expect(await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "9" })).toEqual({ ok: false, reason: "active-code" });
    await recordDownload(code.code, "zip");
    await recordDownload(code.code, "html");
    expect((await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "9" })).ok).toBe(true);
  });
});

describe("requests", () => {
  it("blocks a second open request and rate-limits per email", async () => {
    expect((await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "1" })).ok).toBe(true);
    expect(await createRequest({ name: "Ada", email: "ada@example.com", reason: "", ip: "1" })).toEqual({ ok: false, reason: "pending" });
    kv.set("ff:rl:req:email:cy@example.com", "3");
    expect(await createRequest({ name: "Cy", email: "cy@example.com", reason: "", ip: "3" })).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("lists requests newest first with their code's state", async () => {
    await requestAndIssue("a@example.com", "1");
    await new Promise((r) => setTimeout(r, 2));
    await createRequest({ name: "Bo", email: "b@example.com", reason: "why", ip: "2" });
    const rows = await listRequests();
    expect(rows.map((r) => r.request.email)).toEqual(["b@example.com", "a@example.com"]);
    expect(rows[1].code?.state).toBe("active");
  });
});
