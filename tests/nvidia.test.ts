import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.NVIDIA_API_KEY = "nvapi-test-key-000000000000";
delete process.env.NVIDIA_MODEL;
process.env.AI_TEXT_FALLBACK = "none"; // most tests exercise NVIDIA alone

type Mod = typeof import("@/lib/ai/nvidia");
let ai: Mod;
beforeAll(async () => { ai = await import("@/lib/ai/nvidia"); });
afterEach(() => { vi.unstubAllGlobals(); ai.resetModelStats(); });

const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const bodyModel = (init?: RequestInit) => JSON.parse(String(init?.body)).model as string;
const hang = (init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));

describe("NVIDIA hedged chat", () => {
  it("falls through overloaded and retired models immediately", async () => {
    const [first, second, third] = [ai.DEFAULT_MODELS[0], ai.DEFAULT_MODELS[1], ai.DEFAULT_MODELS[2]];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const m = bodyModel(init);
      if (m === first) return new Response("{}", { status: 503 });
      if (m === second) return new Response("{}", { status: 404 });
      if (m === third) return ok("<think>hmm</think>Hello from the third model.");
      return hang(init);
    }));
    expect(await ai.chat([{ role: "user", content: "hi" }])).toBe("Hello from the third model.");
    // failed models are pushed back; the one that answered goes first next time
    expect(ai.orderModels(ai.DEFAULT_MODELS)[0]).toBe(third);
  });

  it("hedges: a slow model doesn't block a faster backup", async () => {
    vi.useFakeTimers();
    const [slow, fast] = [ai.DEFAULT_MODELS[0], ai.DEFAULT_MODELS[1]];
    const aborted: string[] = [];
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => {
      const m = bodyModel(init);
      init?.signal?.addEventListener("abort", () => aborted.push(m));
      if (m === fast) return Promise.resolve(ok("fast answer"));
      return hang(init);
    }));
    const p = ai.chat([{ role: "user", content: "hi" }]);
    await vi.advanceTimersByTimeAsync(6_100); // hedge fires
    expect(await p).toBe("fast answer");
    expect(aborted).toContain(slow); // the loser is cancelled
    vi.useRealTimers();
  });

  it("gives a plain busy message (no model names or codes) when everything fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const err = (await ai.chat([{ role: "user", content: "hi" }]).catch((e: Error) => e)) as Error;
    expect(err).toBeInstanceOf(ai.AiUnavailable);
    expect(err.message).toBe("The AI is busy right now — please try again in a minute.");
    expect(err.message).not.toMatch(/nvidia|nemotron|503|HTTP/);
  });

  it("keeps failed models at the back instead of dropping them", () => {
    const list = ["a", "b", "c"];
    expect(ai.orderModels(list)).toEqual(["a", "b", "c"]);
  });

  it("queues the Pollinations fallback as the third hedge slot", () => {
    const q = ai.buildQueue(["n1", "n2", "n3"], true);
    expect(q).toEqual(["n1", "n2", ...ai.POLLINATIONS_FALLBACK, "n3"]);
    expect(ai.buildQueue(["n1", "n2", "n3"], false)).toEqual(["n1", "n2", "n3"]);
  });

  it("never waits past the overall deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => hang(init)));
    const p = ai.chat([{ role: "user", content: "hi" }]).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(50_100);
    expect(await p).toBeInstanceOf(ai.AiUnavailable);
    vi.useRealTimers();
  });
});
