import { inspect } from "node:util";
import { GrammyError, HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { AlreadyExistsError } from "../domain";
import { CallbackNotFoundError } from "../callbacks";
import { describeError, errorCodeOf, UpdateProcessingError } from "./errors";
import { classifyTelegramError } from "./telegramErrors";

const TOKEN = "123456789:TEST_TOKEN_PLACEHOLDER_aaaaaaaaaaaaaaaaaaaaaaaa";

function apiError(
  errorCode: number,
  description: string,
  parameters?: { retry_after?: number; migrate_to_chat_id?: number },
): GrammyError {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: errorCode, description, ...(parameters ? { parameters } : {}) },
    "sendMessage",
    { chat_id: 1, text: "private text" },
  );
}

describe("classifyTelegramError", () => {
  it.each([
    [apiError(429, "Too Many Requests: retry after 5", { retry_after: 5 }), "rate_limited"],
    [apiError(403, "Forbidden: bot was blocked by the user"), "forbidden"],
    [apiError(403, "Forbidden: bot was kicked from the group chat"), "forbidden"],
    [
      apiError(400, "Bad Request: message is not modified: specified new message content and reply markup are exactly the same"),
      "message_not_modified",
    ],
    [
      apiError(400, "Bad Request: query is too old and response timeout expired or query ID is invalid"),
      "query_too_old",
    ],
    [
      apiError(400, "Bad Request: group chat was upgraded to a supergroup chat", { migrate_to_chat_id: -100 }),
      "chat_migrated",
    ],
    [apiError(502, "Bad Gateway"), "server_error"],
    [apiError(400, "Bad Request: chat not found"), "bad_request"],
    [apiError(409, "Conflict: terminated by other getUpdates request"), "other"],
  ] as const)("classifies %#", (error, kind) => {
    expect(classifyTelegramError(error)).toBe(kind);
  });

  it("returns undefined for anything that is not a Bot API error", () => {
    expect(classifyTelegramError(new Error("boom"))).toBeUndefined();
    expect(classifyTelegramError(new HttpError("net", new Error("x")))).toBeUndefined();
    expect(classifyTelegramError("string")).toBeUndefined();
  });
});

describe("errorCodeOf", () => {
  it("uses the code of a layer error", () => {
    expect(errorCodeOf(new AlreadyExistsError("x"))).toBe("already_exists");
    expect(errorCodeOf(new CallbackNotFoundError("owner_mismatch"))).toBe("callback_not_found");
  });

  it("names Bot API errors by kind and transport errors by class", () => {
    expect(errorCodeOf(apiError(403, "Forbidden: bot was blocked by the user"))).toBe("telegram_forbidden");
    expect(errorCodeOf(apiError(409, "Conflict"))).toBe("telegram_error");
    expect(errorCodeOf(new HttpError("net", new Error("x")))).toBe("telegram_network_error");
  });

  it("uses one generic code for anything else", () => {
    expect(errorCodeOf(new TypeError("x"))).toBe("unexpected");
    expect(errorCodeOf("boom")).toBe("unexpected");
  });
});

describe("describeError", () => {
  it("describes a Bot API error without its payload", () => {
    const description = describeError(apiError(400, "Bad Request: chat not found"));

    expect(description).toEqual({
      errorClass: "GrammyError",
      errorCode: "telegram_bad_request",
      telegramStatus: 400,
      method: "sendMessage",
      detail: "Bad Request: chat not found",
    });
    expect(JSON.stringify(description)).not.toContain("private text");
  });

  it("removes a bot token that a transport error carries in its cause", () => {
    const cause = new Error(`request to https://api.example.test/bot${TOKEN}/sendMessage failed, reason: socket hang up`);
    const description = describeError(new HttpError("Network request for 'sendMessage' failed!", cause));

    expect(JSON.stringify(description)).not.toContain(TOKEN);
    expect(description).toMatchObject({ errorClass: "HttpError", errorCode: "telegram_network_error" });
  });

  it("describes a layer error with its code and safe message", () => {
    expect(describeError(new AlreadyExistsError("Task id is taken"))).toEqual({
      errorClass: "AlreadyExistsError",
      errorCode: "already_exists",
      detail: "Task id is taken",
    });
  });

  it("never includes the message of an unknown error (it may quote user text)", () => {
    const description = describeError(new TypeError("cannot read property of my private text"));

    expect(description).toEqual({ errorClass: "TypeError", errorCode: "unexpected" });
  });
});

describe("UpdateProcessingError", () => {
  it("keeps the cause and update id and has a safe message", () => {
    const cause = new TypeError("secret text");
    const error = new UpdateProcessingError({ updateId: 42, causeCode: "unexpected", cause });

    expect(error.code).toBe("update_processing_failed");
    expect(error.updateId).toBe(42);
    expect(error.causeCode).toBe("unexpected");
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("secret text");
  });

  it("renders a redacted description, never the raw cause, through JSON.stringify", () => {
    const cause = apiError(400, "Bad Request: chat not found");
    const error = new UpdateProcessingError({ updateId: 7, causeCode: "telegram_bad_request", cause });

    const json = JSON.stringify(error);

    expect(JSON.parse(json)).toEqual({
      name: "UpdateProcessingError",
      code: "update_processing_failed",
      updateId: 7,
      causeCode: "telegram_bad_request",
      cause: { errorClass: "GrammyError", errorCode: "telegram_bad_request", telegramStatus: 400, method: "sendMessage", detail: "Bad Request: chat not found" },
    });
    expect(json).not.toContain("private text");
  });

  it("renders the same redacted description through util.inspect (console.log/console.error)", () => {
    const cause = new TypeError("cannot read property of my private text");
    const error = new UpdateProcessingError({ updateId: 7, causeCode: "unexpected", cause });

    const rendered = inspect(error);

    expect(rendered).toContain("UpdateProcessingError");
    expect(rendered).toContain("unexpected");
    expect(rendered).not.toContain("private text");
  });

  it("never leaks the request payload of a Bot API error through either route", () => {
    const cause = apiError(400, "Bad Request: chat not found");
    const error = new UpdateProcessingError({ updateId: 7, causeCode: "telegram_bad_request", cause });

    expect(JSON.stringify(error)).not.toContain("private text");
    expect(inspect(error)).not.toContain("private text");
  });

  it("never leaks a bot token from a network error through either route", () => {
    const cause = new HttpError(
      "Network request failed!",
      new Error(`request to https://api.example.test/bot${TOKEN}/sendMessage failed`),
    );
    const error = new UpdateProcessingError({ updateId: 7, causeCode: "telegram_network_error", cause });

    expect(JSON.stringify(error)).not.toContain(TOKEN);
    expect(inspect(error)).not.toContain(TOKEN);
  });
});
