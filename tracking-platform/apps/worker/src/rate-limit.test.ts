import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit.js";
import { createFakeKv } from "./test/fake-kv.js";
import type { Env } from "./env.js";

function makeEnv(): Env {
  return { ROUTES_KV: createFakeKv() } as unknown as Env;
}

describe("checkRateLimit", () => {
  it("permite requisicoes dentro do limite", async () => {
    const env = makeEnv();
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(env, "test-key", 5, 60);
      expect(result.allowed).toBe(true);
    }
  });

  it("bloqueia depois de exceder o limite na mesma janela", async () => {
    const env = makeEnv();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env, "test-key", 5, 60);
    }
    const result = await checkRateLimit(env, "test-key", 5, 60);
    expect(result.allowed).toBe(false);
  });

  it("mantem chaves diferentes isoladas", async () => {
    const env = makeEnv();
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env, "key-a", 5, 60);
    }
    const result = await checkRateLimit(env, "key-b", 5, 60);
    expect(result.allowed).toBe(true);
  });
});
