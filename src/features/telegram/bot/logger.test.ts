import { describe, expect, it } from "vitest";
import { createJsonLogger, createMemoryLogger } from "./logger";
import { REDACTED } from "./redaction";

const TOKEN = "123456789:TEST_TOKEN_PLACEHOLDER_aaaaaaaaaaaaaaaaaaaaaaaa";

describe("createJsonLogger", () => {
  it("writes one JSON line per record with level and event", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.info("update.processed", { updateId: 7, outcome: "ok" });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      level: "info",
      event: "update.processed",
      updateId: 7,
      outcome: "ok",
    });
  });

  it("drops records below the minimum level (info by default)", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line));

    logger.debug("noisy");
    logger.info("kept");

    expect(lines.map((line) => JSON.parse(line).event)).toEqual(["kept"]);
  });

  it("carries child bindings, and a field cannot override level or event", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line)).child({ updateId: 9 });

    logger.warn("thing", { level: "debug", event: "spoofed", extra: 1 });

    expect(JSON.parse(lines[0] ?? "")).toEqual({
      level: "warn",
      event: "thing",
      updateId: 9,
      extra: 1,
    });
  });

  it("redacts additional keys given by the caller", () => {
    const lines: string[] = [];
    const logger = createJsonLogger((line) => lines.push(line), { redact: ["chatTitle"] });

    logger.info("x", { chatTitle: "Private plans" });

    expect(JSON.parse(lines[0] ?? "").chatTitle).toBe(REDACTED);
  });
});

describe("redaction", () => {
  it.each([
    "token",
    "text",
    "caption",
    "sourceText",
    "callback_data",
    "query",
    "first_name",
    "last_name",
    "username",
    "phone",
    "secret_token",
    "botToken",
    "title",
    "chatTitle",
    "name",
    "bio",
    "description",
  ])("replaces the value of a field named %s", (key) => {
    const logger = createMemoryLogger();

    logger.info("x", { [key]: "sensitive value" });

    expect(logger.records[0]?.[key]).toBe(REDACTED);
    expect(logger.serialized()).not.toContain("sensitive value");
  });

  it("redacts a group or channel title (chatTitle)", () => {
    const logger = createMemoryLogger();

    logger.info("x", { chatTitle: "EVIL" });

    expect(logger.records[0]?.chatTitle).toBe(REDACTED);
    expect(logger.serialized()).not.toContain("EVIL");
  });

  it("redacts sensitive keys in nested objects and arrays", () => {
    const logger = createMemoryLogger();

    logger.info("x", { from: { username: "alex_test", id: 5 }, items: [{ text: "hello" }] });

    expect(logger.records[0]).toMatchObject({
      from: { username: REDACTED, id: 5 },
      items: [{ text: REDACTED }],
    });
  });

  it("redacts a bot token inside another string", () => {
    const logger = createMemoryLogger();

    logger.error("x", { detail: `request to https://api.example.test/bot${TOKEN}/sendMessage failed` });

    expect(logger.serialized()).not.toContain(TOKEN);
    expect(logger.serialized()).not.toContain("TEST_TOKEN_PLACEHOLDER");
    expect(logger.serialized()).toContain(`/bot${REDACTED}/sendMessage`);
  });

  it("keeps harmless numbers, booleans and short strings", () => {
    const logger = createMemoryLogger();

    logger.info("x", { updateId: 12, ok: true, kind: "message", none: null });

    expect(logger.records[0]).toMatchObject({ updateId: 12, ok: true, kind: "message", none: null });
  });

  it("caps very long strings so accidental dumps stay small", () => {
    const logger = createMemoryLogger();

    logger.info("x", { detail: "a".repeat(5000) });

    const detail = logger.records[0]?.detail;
    expect(typeof detail === "string" && detail.length < 600).toBe(true);
  });

  it("stops descending into deeply nested values", () => {
    const logger = createMemoryLogger();
    let value: Record<string, unknown> = { leaf: "x" };
    for (let depth = 0; depth < 20; depth += 1) value = { next: value };

    logger.info("x", { value: value as never });

    expect(logger.serialized()).toContain("[truncated]");
  });
});

describe("createMemoryLogger", () => {
  it("records post-redaction output at every level and can be cleared", () => {
    const logger = createMemoryLogger();

    logger.debug("a");
    logger.info("b", { text: "hi" });
    logger.child({ updateId: 1 }).warn("c");

    expect(logger.records.map((record) => record.event)).toEqual(["a", "b", "c"]);
    expect(logger.records[1]?.text).toBe(REDACTED);
    expect(logger.records[2]?.updateId).toBe(1);
    logger.clear();
    expect(logger.records).toEqual([]);
  });
});
