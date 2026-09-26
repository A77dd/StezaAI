import { describe, expect, it } from "vitest";
import {
  INTENT_KINDS,
  InvalidIntentError,
  MAX_INTENT_TEXT_LENGTH,
  parseInstant,
  PRIORITIES,
} from "../../domain";
import type { Intent, IntentParser } from "../../domain";
import { makeSource } from "../domainFixtures";
import { useSubject } from "./harness";
import type { ContractFactory } from "./harness";

const NOW = "2026-09-23T08:30:00.000Z";
const TIMEZONE = "Europe/Moscow";

/** Varied inputs: tasks, meetings, reminders, chit-chat, punctuation-only, emoji, long text. */
const SAMPLES = [
  "Нужно до пятницы подготовить презентацию, часа на два",
  "Посмотри договор до завтра",
  "Нам нужно будет обсудить маркетинговый план позже.",
  "напомни обсудить бюджет",
  "встреча с Сергеем завтра 30 минут",
  "спасибо, принято",
  "?",
  "👍",
  "...",
  "Buy milk tomorrow",
  "x".repeat(4096),
];

/**
 * Shape-only invariants every parser must satisfy, whether it is the
 * rule-based stand-in or an LLM adapter. It says nothing about WHICH intent a
 * text produces.
 */
export function describeIntentParserContract(
  name: string,
  factory: ContractFactory<IntentParser>,
): void {
  describe(`${name} satisfies the IntentParser contract`, () => {
    const parser = useSubject(factory);
    const parse = (text: string): Promise<Intent> =>
      parser().parse({ text, now: NOW, timezone: TIMEZONE, source: makeSource({ sourceText: text }) });

    it.each(SAMPLES)("returns a well-formed intent for %j", async (text) => {
      const intent = await parse(text);

      expect(INTENT_KINDS).toContain(intent.kind);
      expect(PRIORITIES).toContain(intent.priority);
      expect(intent.title.trim()).not.toBe("");
      expect(intent.confidence).toBeGreaterThanOrEqual(0);
      expect(intent.confidence).toBeLessThanOrEqual(1);
      if (intent.deadline !== null) {
        expect(() => parseInstant(intent.deadline as string)).not.toThrow();
      }
      if (intent.durationMinutes !== null) {
        expect(Number.isInteger(intent.durationMinutes)).toBe(true);
        expect(intent.durationMinutes).toBeGreaterThan(0);
      }
      expect(Array.isArray(intent.participants)).toBe(true);
      for (const participant of intent.participants) {
        expect(participant.trim()).not.toBe("");
      }
    });

    it.each(SAMPLES)("gives info no deadline and no duration: %j", async (text) => {
      const intent = await parse(text);
      if (intent.kind === "info") {
        expect(intent.deadline).toBeNull();
        expect(intent.durationMinutes).toBeNull();
      }
    });

    it.each(SAMPLES)("is deterministic for identical input: %j", async (text) => {
      await expect(parse(text)).resolves.toEqual(await parse(text));
    });

    it("returns a fresh participants array each time", async () => {
      const a = await parse("встреча с Сергеем завтра 30 минут");
      const b = await parse("встреча с Сергеем завтра 30 минут");
      expect(a.participants).not.toBe(b.participants);
    });

    it.each(["", " ", "\n\t  "])("rejects empty or whitespace-only text %j", async (text) => {
      await expect(parse(text)).rejects.toThrow(InvalidIntentError);
    });

    it("rejects text longer than MAX_INTENT_TEXT_LENGTH", async () => {
      await expect(parse("a".repeat(MAX_INTENT_TEXT_LENGTH + 1))).rejects.toThrow(InvalidIntentError);
    });

    it("accepts text of exactly MAX_INTENT_TEXT_LENGTH", async () => {
      await expect(parse("a".repeat(MAX_INTENT_TEXT_LENGTH))).resolves.toBeDefined();
    });
  });
}
