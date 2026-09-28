import { describe, expect, expectTypeOf, it } from "vitest";
import { createFixedClock } from "../adapters";
import { AlreadyExistsError, InvalidArgumentError } from "../domain";
import type { CheckInReason } from "../domain";
import { describeCallbackStoreContract } from "../testing/contracts";
import type { CallbackStoreSubject } from "../testing/contracts";
import { SAMPLE_CALLBACK_PAYLOADS } from "../testing/callbackFixtures";
import type { CallbackPayload } from "./actions";
import { CALLBACK_ACTIONS } from "./actions";
import { CallbackExpiredError, CallbackNotFoundError, CallbackReplayedError } from "./errors";
import { createInMemoryCallbackStore, DEFAULT_CALLBACK_PURGE_GRACE_MS } from "./inMemoryCallbackStore";
import type { StoredCallback } from "./inMemoryCallbackStore";
import type { ResolvedCallback, TokenGenerator } from "./ports";
import { createCryptoTokenGenerator, createSequentialTokenGenerator } from "./tokens";

const START = "2026-09-26T09:00:00.000Z";
const OWNER = { userId: "user_1", chatId: 1001 };

function createSubject(tokens: TokenGenerator): CallbackStoreSubject {
  const clock = createFixedClock(START);
  const records = new Map<string, StoredCallback>();
  const store = createInMemoryCallbackStore({ clock, tokens, records });
  return {
    store,
    advance: (ms) => clock.advance(ms / 60_000),
    now: () => clock.now(),
    corruptPayload(data, payload) {
      const token = data.split(":")[2] ?? "";
      const record = records.get(token);
      if (record === undefined) throw new Error("Test setup: no such callback");
      record.payload = payload;
    },
  };
}

describeCallbackStoreContract("inMemoryCallbackStore (sequential tokens)", () => ({
  port: createSubject(createSequentialTokenGenerator()),
}));

describeCallbackStoreContract("inMemoryCallbackStore (crypto tokens)", () => ({
  port: createSubject(createCryptoTokenGenerator()),
}));

describe("inMemoryCallbackStore", () => {
  function setup(options: { purgeGraceMs?: number; tokens?: TokenGenerator } = {}) {
    const clock = createFixedClock(START);
    const store = createInMemoryCallbackStore({
      clock,
      tokens: options.tokens ?? createSequentialTokenGenerator(),
      ...(options.purgeGraceMs === undefined ? {} : { purgeGraceMs: options.purgeGraceMs }),
    });
    return { clock, store };
  }

  it("throws AlreadyExistsError instead of overwriting when the generator repeats a token", async () => {
    const { store } = setup({ tokens: { next: () => "constant1" } });
    const first = await store.issue({ action: "noop", ...OWNER, payload: {} });

    await expect(store.issue({ action: "noop", ...OWNER, payload: {} })).rejects.toThrow(AlreadyExistsError);
    await expect(store.resolve(first, OWNER)).resolves.toMatchObject({ action: "noop" });
  });

  it("does not store anything when the generator returns a token the codec rejects", async () => {
    const { store } = setup({ tokens: { next: () => "bad token!" } });
    await expect(store.issue({ action: "noop", ...OWNER, payload: {} })).rejects.toThrow();
    await expect(store.purgeExpired("2030-01-01T00:00:00.000Z")).resolves.toBe(0);
  });

  it("rejects a negative or fractional purgeGraceMs", () => {
    expect(() => setup({ purgeGraceMs: -1 })).toThrow(InvalidArgumentError);
    expect(() => setup({ purgeGraceMs: 1.5 })).toThrow(InvalidArgumentError);
  });

  it("keeps expired callbacks explainable until expiry + grace, then forgets them", async () => {
    const { clock, store } = setup({ purgeGraceMs: 60_000 });
    const data = await store.issue({ action: "task.edit", ...OWNER, payload: SAMPLE_CALLBACK_PAYLOADS["task.edit"] });
    clock.advance(CALLBACK_ACTIONS["task.edit"].ttlMs / 60_000);

    await expect(store.purgeExpired(clock.now())).resolves.toBe(0);
    await expect(store.resolve(data, OWNER)).rejects.toThrow(CallbackExpiredError);

    clock.advance(1);
    await expect(store.purgeExpired(clock.now())).resolves.toBe(1);
    await expect(store.resolve(data, OWNER)).rejects.toThrow(CallbackNotFoundError);
  });

  it("uses a 24 hour grace by default", async () => {
    expect(DEFAULT_CALLBACK_PURGE_GRACE_MS).toBe(24 * 60 * 60 * 1000);
    const { clock, store } = setup();
    await store.issue({ action: "noop", ...OWNER, payload: {} });
    clock.advance(30 * 24 * 60 + 23 * 60);
    await expect(store.purgeExpired(clock.now())).resolves.toBe(0);
    clock.advance(60);
    await expect(store.purgeExpired(clock.now())).resolves.toBe(1);
  });

  it("keeps a consumed single-use token so a replay is 'replayed', not 'not found'", async () => {
    const { store } = setup();
    const data = await store.issue({ action: "slot.pick", ...OWNER, payload: SAMPLE_CALLBACK_PAYLOADS["slot.pick"] });
    await store.resolve(data, OWNER);

    await expect(store.resolve(data, OWNER)).rejects.toThrow(CallbackReplayedError);
  });
});

describe("ResolvedCallback typing", () => {
  it("narrows the payload by action", () => {
    const resolved = {
      action: "slot.pick",
      payload: { taskId: "task_1", slotIndex: 1 },
      issuedAt: START,
    } as ResolvedCallback;

    if (resolved.action === "slot.pick") {
      expectTypeOf(resolved.payload).toEqualTypeOf<CallbackPayload<"slot.pick">>();
      expectTypeOf(resolved.payload.slotIndex).toEqualTypeOf<number>();
    }
    if (resolved.action === "checkin.reason") {
      expectTypeOf(resolved.payload.reason).toEqualTypeOf<CheckInReason>();
    }
    if (resolved.action === "noop") {
      expectTypeOf(resolved.payload).toEqualTypeOf<Record<string, never>>();
    }
    expectTypeOf<ResolvedCallback["action"]>().toEqualTypeOf<keyof typeof CALLBACK_ACTIONS>();
  });

  it("is what CallbackStore.resolve returns", () => {
    const { store } = { store: createInMemoryCallbackStore({ clock: createFixedClock(START), tokens: createSequentialTokenGenerator() }) };
    expectTypeOf(store.resolve).returns.resolves.toEqualTypeOf<ResolvedCallback>();
  });

  it("types issue payloads by action", () => {
    const { store } = { store: createInMemoryCallbackStore({ clock: createFixedClock(START), tokens: createSequentialTokenGenerator() }) };
    expectTypeOf(store.issue<"slot.pick">).parameter(0).toHaveProperty("payload").toEqualTypeOf<CallbackPayload<"slot.pick">>();
  });
});
