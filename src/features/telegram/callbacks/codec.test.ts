import { describe, expect, it } from "vitest";
import { TelegramLayerError } from "../domain";
import { CALLBACK_ACTIONS } from "./actions";
import type { CallbackAction } from "./actions";
import { decodeCallbackData, encodeCallbackData, MAX_CALLBACK_DATA_BYTES } from "./codec";
import {
  CallbackMalformedError,
  CallbackTooLongError,
  CallbackUnknownActionError,
  CallbackVersionError,
} from "./errors";

const ACTIONS = Object.keys(CALLBACK_ACTIONS) as CallbackAction[];
const byteLength = (value: string): number => new TextEncoder().encode(value).length;

describe("encodeCallbackData / decodeCallbackData", () => {
  it("encodes as v1:<action>:<token>", () => {
    expect(encodeCallbackData("slot.pick", "tok00001")).toBe("v1:slot.pick:tok00001");
  });

  it.each(ACTIONS)("round-trips %s", (action) => {
    const token = "Ab3_-Zz9";
    const data = encodeCallbackData(action, token);
    expect(decodeCallbackData(data)).toEqual({ version: 1, action, token });
  });

  it("limits data to 64 bytes", () => {
    expect(MAX_CALLBACK_DATA_BYTES).toBe(64);
  });

  it("stays within 64 bytes for every action with the longest allowed token", () => {
    const token = "A".repeat(32);
    for (const action of ACTIONS) {
      const data = encodeCallbackData(action, token);
      expect(byteLength(data)).toBeLessThanOrEqual(64);
      expect(decodeCallbackData(data)).toEqual({ version: 1, action, token });
    }
  });

  it("property: every action round-trips for every token length and charset position", () => {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    for (const action of ACTIONS) {
      for (let length = 8; length <= 32; length += 1) {
        for (let offset = 0; offset < charset.length; offset += 7) {
          const token = Array.from({ length }, (_, index) => charset[(offset + index) % charset.length]).join("");
          const data = encodeCallbackData(action, token);
          expect(byteLength(data)).toBeLessThanOrEqual(64);
          expect(decodeCallbackData(data)).toEqual({ version: 1, action, token });
        }
      }
    }
  });

  it("rejects an oversized token with CallbackTooLongError", () => {
    expect(() => encodeCallbackData("slot.pick", "A".repeat(60))).toThrow(CallbackTooLongError);
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 30 Cyrillic letters: 30 characters but 60 bytes, so the whole string is
    // 3 + 8 + 1 + 60 = 72 bytes even though its length is only 42.
    const token = "ж".repeat(30);
    const data = `v1:slot.pick:${token}`;
    expect(data.length).toBeLessThan(64);
    expect(byteLength(data)).toBeGreaterThan(64);
    expect(() => encodeCallbackData("slot.pick", token)).toThrow(CallbackTooLongError);
  });

  it("checks the byte limit at exactly 64 / 65 bytes before the token charset", () => {
    // 3 + 14 + 1 + 46 = 64 bytes passes the byte check (then fails the
    // charset check); 47 token characters make 65 bytes and are too long.
    expect(() => encodeCallbackData("checkin.answer", "A".repeat(46))).toThrow(CallbackMalformedError);
    expect(() => encodeCallbackData("checkin.answer", "A".repeat(47))).toThrow(CallbackTooLongError);
  });

  it.each([
    ["too short", "abc1234"],
    ["too long", "A".repeat(33)],
    ["empty", ""],
    ["colon", "abcd:efgh"],
    ["space", "abcd efgh"],
    ["unicode", "abcdéfgh"],
    ["newline", "abcdefgh\n"],
    ["dot", "abcd.efgh"],
  ])("rejects an invalid token when encoding (%s)", (_label, token) => {
    expect(() => encodeCallbackData("noop", token)).toThrow(TelegramLayerError);
  });

  it("rejects an unknown action when encoding", () => {
    expect(() => encodeCallbackData("slot.delete" as CallbackAction, "tok00001")).toThrow(
      CallbackUnknownActionError,
    );
    expect(() => encodeCallbackData("toString" as CallbackAction, "tok00001")).toThrow(
      CallbackUnknownActionError,
    );
  });
});

describe("decodeCallbackData strict parsing", () => {
  it.each([
    ["empty string", ""],
    ["no separators", "v1"],
    ["one separator", "v1:noop"],
    ["extra colon", "v1:noop:tok00001:x"],
    ["trailing colon", "v1:noop:tok00001:"],
    ["empty action", "v1::tok00001"],
    ["empty token", "v1:noop:"],
    ["empty version", ":noop:tok00001"],
    ["leading space", " v1:noop:tok00001"],
    ["trailing space", "v1:noop:tok00001 "],
    ["inner space", "v1:noop:tok 00001"],
    ["newline", "v1:noop:tok00001\n"],
    ["tab", "v1:noop:\ttok00001"],
    ["unicode token", "v1:noop:tokéé001"],
    ["cyrillic action", "v1:нет:tok00001"],
    ["uppercase action", "v1:NOOP:tok00001"],
    ["prototype name with capital", "v1:toString:tok00001"],
    ["proto name", "v1:__proto__:tok00001"],
    ["token too short", "v1:noop:tok0001"],
    ["token too long", `v1:noop:${"a".repeat(33)}`],
    ["token with dot", "v1:noop:tok.00001"],
    ["version without digits", "vx:noop:tok00001"],
    ["version without v", "1:noop:tok00001"],
    ["uppercase version", "V1:noop:tok00001"],
    ["over 64 bytes", `v1:noop:${"a".repeat(60)}`],
    ["null byte", "v1:noop:tok0000\u00001"],
    ["json", '{"a":"noop"}'],
  ])("rejects %s as malformed", (_label, data) => {
    expect(() => decodeCallbackData(data)).toThrow(CallbackMalformedError);
  });

  it.each(["v0:noop:tok00001", "v2:noop:tok00001", "v10:noop:tok00001", "v99"])(
    "rejects unsupported version in %s",
    (data) => {
      expect(() => decodeCallbackData(data)).toThrow(CallbackVersionError);
    },
  );

  it.each([
    "v1:slot.delete:tok00001",
    "v1:constructor:tok00001",
    "v1:slot:tok00001",
  ])("rejects unknown action in %s", (data) => {
    expect(() => decodeCallbackData(data)).toThrow(CallbackUnknownActionError);
  });

  it("carries stable machine-readable codes", () => {
    const codes = [
      [() => decodeCallbackData("nonsense"), "callback_malformed"],
      [() => decodeCallbackData("v2:noop:tok00001"), "callback_unsupported_version"],
      [() => decodeCallbackData("v1:zzz:tok00001"), "callback_unknown_action"],
      [() => encodeCallbackData("noop", "A".repeat(60)), "callback_too_long"],
    ] as const;
    for (const [run, code] of codes) {
      try {
        run();
        expect.unreachable("expected a throw");
      } catch (error) {
        expect(error).toBeInstanceOf(TelegramLayerError);
        expect((error as TelegramLayerError).code).toBe(code);
      }
    }
  });

  it("does not echo client-controlled data in error messages", () => {
    const data = "v1:noop:secret-user-input-that-is-far-too-long-to-be-a-token-anyway";
    try {
      decodeCallbackData(data);
      expect.unreachable("expected a throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-user-input");
    }
  });
});
