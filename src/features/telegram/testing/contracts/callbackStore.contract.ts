import { describe, expect, it } from "vitest";
import { InvalidArgumentError } from "../../domain";
import type { Instant } from "../../domain";
import {
  CALLBACK_ACTIONS,
  CallbackExpiredError,
  CallbackMalformedError,
  CallbackNotFoundError,
  CallbackReplayedError,
  CallbackUnknownActionError,
  CallbackVersionError,
  decodeCallbackData,
} from "../../callbacks";
import type { CallbackAction, CallbackStore } from "../../callbacks";
import { SAMPLE_CALLBACK_PAYLOADS } from "../callbackFixtures";
import { captureRejection, useSubject } from "./harness";
import type { ContractFactory } from "./harness";

/**
 * What the contract needs besides the store itself: control over the store's
 * clock and a way to corrupt a stored payload, so that real adapters (a
 * database with an injected clock) can run the same suite.
 */
export type CallbackStoreSubject = {
  readonly store: CallbackStore;
  /** Moves the clock the store reads forward. */
  advance(ms: number): Promise<void> | void;
  /** The current time of that clock. */
  now(): Instant;
  /** Overwrites the stored payload behind `data`, simulating a corrupted row. */
  corruptPayload(data: string, payload: unknown): Promise<void> | void;
};

const ACTIONS = Object.keys(CALLBACK_ACTIONS) as CallbackAction[];
const SINGLE_USE = ACTIONS.filter((action) => CALLBACK_ACTIONS[action].singleUse);
const MULTI_USE = ACTIONS.filter((action) => !CALLBACK_ACTIONS[action].singleUse);
const DAY_MS = 24 * 60 * 60 * 1000;

const OWNER = { userId: "user_1", chatId: 1001 };
const OTHER_USER = { userId: "user_2", chatId: 1001 };
const OTHER_CHAT = { userId: "user_1", chatId: -2002 };

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

export function describeCallbackStoreContract(
  name: string,
  factory: ContractFactory<CallbackStoreSubject>,
): void {
  describe(`${name} satisfies the CallbackStore contract`, () => {
    const subject = useSubject(factory);

    const issue = <A extends CallbackAction>(action: A, who = OWNER): Promise<string> =>
      subject().store.issue({
        action,
        userId: who.userId,
        chatId: who.chatId,
        payload: SAMPLE_CALLBACK_PAYLOADS[action],
      });

    describe("issue and resolve", () => {
      it.each(ACTIONS)("round-trips %s and returns the issue time", async (action) => {
        const issuedAt = subject().now();
        const data = await issue(action);

        expect(data.startsWith(`v1:${action}:`)).toBe(true);
        expect(decodeCallbackData(data).action).toBe(action);
        await expect(subject().store.resolve(data, OWNER)).resolves.toEqual({
          action,
          payload: SAMPLE_CALLBACK_PAYLOADS[action],
          issuedAt,
        });
      });

      it.each(ACTIONS)("keeps %s callback_data within 64 bytes and codec-valid", async (action) => {
        const data = await issue(action);
        expect(byteLength(data)).toBeLessThanOrEqual(64);
        expect(() => decodeCallbackData(data)).not.toThrow();
      });

      it("issues a different callback_data every time, even for equal payloads", async () => {
        const first = await issue("task.edit");
        const second = await issue("task.edit");
        expect(second).not.toBe(first);
        await expect(subject().store.resolve(first, OWNER)).resolves.toMatchObject({ action: "task.edit" });
        await expect(subject().store.resolve(second, OWNER)).resolves.toMatchObject({ action: "task.edit" });
      });

      it("copies the payload on issue: mutating the input later changes nothing", async () => {
        const payload = { taskId: "task_1" };
        const data = await subject().store.issue({ action: "task.edit", ...OWNER, payload });
        (payload as { taskId: string }).taskId = "task_hacked";

        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({
          payload: { taskId: "task_1" },
        });
      });

      it("copies the payload on resolve: mutating a result does not affect later resolves", async () => {
        const data = await issue("task.edit");
        const first = await subject().store.resolve(data, OWNER);
        (first.payload as { taskId: string }).taskId = "task_hacked";

        const second = await subject().store.resolve(data, OWNER);
        expect(second.payload).toEqual(SAMPLE_CALLBACK_PAYLOADS["task.edit"]);
        expect(second.payload).not.toBe(first.payload);
      });

      it("rejects a payload that fails the action validator with InvalidArgumentError", async () => {
        const bad = subject().store.issue({
          action: "slot.pick",
          ...OWNER,
          payload: { taskId: "task_1", slotIndex: 7 } as never,
        });
        await expect(bad).rejects.toThrow(InvalidArgumentError);
      });

      it("rejects an empty userId and a non-integer chatId with InvalidArgumentError", async () => {
        const payload = SAMPLE_CALLBACK_PAYLOADS["task.edit"];
        await expect(
          subject().store.issue({ action: "task.edit", userId: "", chatId: 1, payload }),
        ).rejects.toThrow(InvalidArgumentError);
        await expect(
          subject().store.issue({ action: "task.edit", userId: "user_1", chatId: 1.5, payload }),
        ).rejects.toThrow(InvalidArgumentError);
      });
    });

    describe("client-controlled input", () => {
      it("rejects malformed data with CallbackMalformedError", async () => {
        for (const data of ["", "garbage", "v1:noop", "v1:noop:tok00001:extra", "v1:noop:short"]) {
          await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackMalformedError);
        }
      });

      it("rejects an unsupported version with CallbackVersionError", async () => {
        const data = (await issue("noop")).replace(/^v1/, "v2");
        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackVersionError);
      });

      it("rejects an unknown action with CallbackUnknownActionError", async () => {
        const data = (await issue("noop")).replace(":noop:", ":teleport:");
        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackUnknownActionError);
      });

      it("treats a tampered token as not found", async () => {
        const data = await issue("noop");
        const last = data.at(-1) === "A" ? "B" : "A";
        const tampered = `${data.slice(0, -1)}${last}`;

        const error = await captureRejection(subject().store.resolve(tampered, OWNER));
        expect(error).toBeInstanceOf(CallbackNotFoundError);
        expect((error as CallbackNotFoundError).reason).toBe("unknown_token");
      });

      it("treats a well-formed token that was never issued as not found", async () => {
        const error = await captureRejection(subject().store.resolve("v1:noop:ZZZZZZZZZZZZ", OWNER));
        expect(error).toBeInstanceOf(CallbackNotFoundError);
        expect((error as CallbackNotFoundError).code).toBe("callback_not_found");
      });

      it("treats a token presented under another action as not found and does not consume it", async () => {
        const data = await issue("slot.other");
        const { token } = decodeCallbackData(data);

        const error = await captureRejection(subject().store.resolve(`v1:slot.pick:${token}`, OWNER));
        expect(error).toBeInstanceOf(CallbackNotFoundError);
        expect((error as CallbackNotFoundError).reason).toBe("action_mismatch");
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action: "slot.other" });
      });

      it("fails validation of a corrupted stored payload with CallbackMalformedError", async () => {
        for (const action of ACTIONS) {
          const data = await issue(action);
          await subject().corruptPayload(data, "definitely not a payload");
          await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackMalformedError);
        }
      });

      it("does not consume a single-use token whose payload is corrupted", async () => {
        const data = await issue("slot.pick");
        await subject().corruptPayload(data, { taskId: "task_1", slotIndex: 9 });
        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackMalformedError);

        await subject().corruptPayload(data, SAMPLE_CALLBACK_PAYLOADS["slot.pick"]);
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action: "slot.pick" });
      });
    });

    describe("ownership", () => {
      it("another user's token behaves like an unknown one: same class, code and message", async () => {
        const data = await issue("slot.pick");
        const unknown = await captureRejection(subject().store.resolve("v1:slot.pick:ZZZZZZZZZZZZ", OTHER_USER));
        const foreign = await captureRejection(subject().store.resolve(data, OTHER_USER));

        expect(foreign).toBeInstanceOf(CallbackNotFoundError);
        expect(foreign.constructor).toBe(unknown.constructor);
        expect((foreign as CallbackNotFoundError).code).toBe((unknown as CallbackNotFoundError).code);
        expect(foreign.message).toBe(unknown.message);
        expect(foreign.message).not.toMatch(/owner|user|chat|mismatch/i);
        // ...but the internal reason lets logs tell them apart.
        expect((foreign as CallbackNotFoundError).reason).toBe("owner_mismatch");
        expect((unknown as CallbackNotFoundError).reason).toBe("unknown_token");
      });

      it("a foreign attempt does not consume the owner's single-use token", async () => {
        const data = await issue("slot.pick");
        await expect(subject().store.resolve(data, OTHER_USER)).rejects.toThrow(CallbackNotFoundError);
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action: "slot.pick" });
      });

      it("a foreign user cannot learn that a token was used or expired", async () => {
        const used = await issue("slot.pick");
        await subject().store.resolve(used, OWNER);
        const expired = await issue("slot.other");
        await subject().advance(DAY_MS);

        await expect(subject().store.resolve(used, OTHER_USER)).rejects.toThrow(CallbackNotFoundError);
        await expect(subject().store.resolve(expired, OTHER_USER)).rejects.toThrow(CallbackNotFoundError);
      });

      it("chat-scoped actions reject the same user in another chat as not found", async () => {
        const data = await issue("context.choose");

        const error = await captureRejection(subject().store.resolve(data, OTHER_CHAT));
        expect(error).toBeInstanceOf(CallbackNotFoundError);
        expect((error as CallbackNotFoundError).reason).toBe("chat_mismatch");
        expect(error.message).toBe(
          (await captureRejection(subject().store.resolve(data, OTHER_USER))).message,
        );
        // The failed attempt did not consume it.
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action: "context.choose" });
      });

      it("user-scoped actions work from another chat for the same user", async () => {
        for (const action of ACTIONS.filter((candidate) => CALLBACK_ACTIONS[candidate].scope === "user")) {
          const data = await issue(action);
          await expect(subject().store.resolve(data, OTHER_CHAT)).resolves.toMatchObject({ action });
        }
      });
    });

    describe("expiry", () => {
      it.each(ACTIONS)("%s works until its ttl and expires exactly at it", async (action) => {
        const { ttlMs } = CALLBACK_ACTIONS[action];
        const alive = await issue(action);
        const dying = await issue(action);

        await subject().advance(ttlMs - 1);
        await expect(subject().store.resolve(alive, OWNER)).resolves.toMatchObject({ action });

        await subject().advance(1);
        await expect(subject().store.resolve(dying, OWNER)).rejects.toThrow(CallbackExpiredError);
      });

      it("reports an expired token as expired even after it was consumed", async () => {
        const data = await issue("slot.pick");
        await subject().store.resolve(data, OWNER);
        await subject().advance(CALLBACK_ACTIONS["slot.pick"].ttlMs);

        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackExpiredError);
      });

      it("measures ttl from the issue time, not from the last use", async () => {
        const data = await issue("task.edit");
        const { ttlMs } = CALLBACK_ACTIONS["task.edit"];
        await subject().advance(ttlMs - 1000);
        await subject().store.resolve(data, OWNER);
        await subject().advance(1000);

        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackExpiredError);
      });
    });

    describe("single use", () => {
      it.each(SINGLE_USE)("%s is consumed by the first resolve; a replay is CallbackReplayedError", async (action) => {
        const data = await issue(action);
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action });

        const error = await captureRejection(subject().store.resolve(data, OWNER));
        expect(error).toBeInstanceOf(CallbackReplayedError);
        expect((error as CallbackReplayedError).code).toBe("callback_replayed");
        await expect(subject().store.resolve(data, OWNER)).rejects.toThrow(CallbackReplayedError);
      });

      it.each(SINGLE_USE)("%s: of two concurrent resolves exactly one succeeds", async (action) => {
        const data = await issue(action);

        const outcomes = await Promise.allSettled([
          subject().store.resolve(data, OWNER),
          subject().store.resolve(data, OWNER),
        ]);

        const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
        const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(CallbackReplayedError);
      });

      it("consuming one token leaves other tokens of the same action untouched", async () => {
        const first = await issue("slot.pick");
        const second = await issue("slot.pick");
        await subject().store.resolve(first, OWNER);

        await expect(subject().store.resolve(second, OWNER)).resolves.toMatchObject({ action: "slot.pick" });
      });

      it.each(MULTI_USE)("%s can be resolved repeatedly until it expires", async (action) => {
        const data = await issue(action);
        for (let index = 0; index < 5; index += 1) {
          await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action });
        }
      });
    });

    describe("revokeForUser", () => {
      it("removes every callback of that user, keeps others, and returns the count", async () => {
        const mine = [await issue("slot.pick"), await issue("task.edit"), await issue("noop")];
        const used = await issue("slot.other");
        await subject().store.resolve(used, OWNER);
        const theirs = await issue("task.edit", OTHER_USER);

        await expect(subject().store.revokeForUser(OWNER.userId)).resolves.toBe(4);

        for (const data of [...mine, used]) {
          const error = await captureRejection(subject().store.resolve(data, OWNER));
          expect(error).toBeInstanceOf(CallbackNotFoundError);
          expect((error as CallbackNotFoundError).reason).toBe("unknown_token");
        }
        await expect(subject().store.resolve(theirs, OTHER_USER)).resolves.toMatchObject({ action: "task.edit" });
      });

      it("returns 0 for a user without callbacks", async () => {
        await expect(subject().store.revokeForUser("user_nobody")).resolves.toBe(0);
      });
    });

    describe("purgeExpired", () => {
      it("removes nothing while callbacks are alive", async () => {
        const data = await issue("task.edit");
        await expect(subject().store.purgeExpired(subject().now())).resolves.toBe(0);
        await expect(subject().store.resolve(data, OWNER)).resolves.toMatchObject({ action: "task.edit" });
      });

      it("removes long-expired and consumed callbacks and keeps fresh ones", async () => {
        const expired = await issue("noop");
        const consumed = await issue("slot.pick");
        await subject().store.resolve(consumed, OWNER);

        await subject().advance(400 * DAY_MS);
        const fresh = await issue("noop");

        await expect(subject().store.purgeExpired(subject().now())).resolves.toBe(2);
        for (const data of [expired, consumed]) {
          const error = await captureRejection(subject().store.resolve(data, OWNER));
          expect(error).toBeInstanceOf(CallbackNotFoundError);
        }
        await expect(subject().store.resolve(fresh, OWNER)).resolves.toMatchObject({ action: "noop" });
        await expect(subject().store.purgeExpired(subject().now())).resolves.toBe(0);
      });
    });
  });
}
