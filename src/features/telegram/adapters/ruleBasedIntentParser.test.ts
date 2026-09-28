import { describe, expect, it } from "vitest";
import {
  InvalidIntentError,
  InvalidTimeError,
  InvalidTimezoneError,
  MAX_INTENT_TEXT_LENGTH,
} from "../domain";
import type { Intent } from "../domain";
import { describeIntentParserContract } from "../testing/contracts";
import { makeSource } from "../testing/domainFixtures";
import { createRuleBasedIntentParser } from "./ruleBasedIntentParser";

// Wednesday 2026-09-23, 11:30 in Moscow (UTC+3, no DST).
const NOW = "2026-09-23T08:30:00.000Z";
const MOSCOW = "Europe/Moscow";

describeIntentParserContract("ruleBasedIntentParser", () => ({
  port: createRuleBasedIntentParser(),
}));

function parse(text: string, overrides: { now?: string; timezone?: string; dateTimeHints?: readonly string[] } = {}): Promise<Intent> {
  return createRuleBasedIntentParser().parse({
    text,
    now: overrides.now ?? NOW,
    timezone: overrides.timezone ?? MOSCOW,
    source: makeSource({ sourceText: text }),
    dateTimeHints: overrides.dateTimeHints ?? [],
  });
}

describe("ruleBasedIntentParser: required examples", () => {
  it("extracts an explicit local meeting start time separately from a deadline", async () => {
    const intent = await parse("Давайте согласуем с вами встречу. В пятницу в 17:00. Вот ссылка на встречу: https://meet.example.test/room");
    expect(intent).toMatchObject({
      kind: "meeting",
      scheduledStartAt: "2026-09-25T14:00:00.000Z",
      deadline: null,
    });
  });

  it("uses the first Telegram date_time hint over a conflicting text deadline", async () => {
    const intent = await parse("Посмотри договор до завтра", {
      dateTimeHints: ["2026-10-02T10:15:00.000Z", "2026-10-03T10:15:00.000Z"],
    });
    expect(intent.deadline).toBe("2026-10-02T10:15:00.000Z");
  });
  it("parses a task with a weekday deadline and a rough duration", async () => {
    await expect(parse("Нужно до пятницы подготовить презентацию, часа на два")).resolves.toEqual({
      kind: "task",
      title: "Подготовить презентацию",
      deadline: "2026-09-25T20:59:00.000Z", // Friday 23:59 Moscow
      durationMinutes: 120,
      priority: "normal",
      participants: [],
      confidence: 0.9,
    });
  });

  it("parses a short review task with a default 30 minute estimate", async () => {
    await expect(parse("Посмотри договор до завтра")).resolves.toEqual({
      kind: "task",
      title: "Посмотри договор",
      deadline: "2026-09-24T20:59:00.000Z", // Thursday 23:59 Moscow
      durationMinutes: 30,
      priority: "normal",
      participants: [],
      confidence: 0.9,
    });
  });

  it("parses a vague meeting with no deadline", async () => {
    await expect(parse("Нам нужно будет обсудить маркетинговый план позже.")).resolves.toEqual({
      kind: "meeting",
      title: "Обсудить маркетинговый план",
      deadline: null,
      durationMinutes: 30,
      priority: "normal",
      participants: [],
      confidence: 0.6,
    });
  });

  it("parses a reminder", async () => {
    await expect(parse("напомни обсудить бюджет")).resolves.toEqual({
      kind: "reminder",
      title: "Обсудить бюджет",
      deadline: null,
      durationMinutes: null,
      priority: "normal",
      participants: [],
      confidence: 0.6,
    });
  });

  it("parses a meeting with a participant, a day and a duration", async () => {
    await expect(parse("встреча с Сергеем завтра 30 минут")).resolves.toEqual({
      kind: "meeting",
      title: "Встреча с Сергеем",
      deadline: "2026-09-24T20:59:00.000Z",
      durationMinutes: 30,
      priority: "normal",
      participants: ["Сергей"],
      confidence: 0.9,
    });
  });

  it("classifies acknowledgements as info without inventing fields", async () => {
    await expect(parse("спасибо, принято")).resolves.toEqual({
      kind: "info",
      title: "Спасибо, принято",
      deadline: null,
      durationMinutes: null,
      priority: "normal",
      participants: [],
      confidence: 0.3,
    });
  });
});

describe("ruleBasedIntentParser: durations", () => {
  it.each([
    ["Подготовить отчет на час", 60],
    ["Подготовить отчет на полчаса", 30],
    ["Подготовить отчет полчаса", 30],
    ["Подготовить отчет, часа на два", 120],
    ["Подготовить отчет часа на три", 180],
    ["Подготовить отчет 45 минут", 45],
    ["Подготовить отчет на 20 минут", 20],
    ["Подготовить отчет на пятнадцать минут", 15],
    ["Подготовить отчет 2 часа", 120],
    ["Подготовить отчет на два часа", 120],
    ["Подготовить отчет 1.5 часа", 90],
    ["Подготовить отчет 1,5 часа", 90],
    ["Подготовить отчет полтора часа", 90],
    ["Подготовить отчет 5 часов", 300],
  ])("%s -> %s minutes", async (text, minutes) => {
    const intent = await parse(text);
    expect(intent.durationMinutes).toBe(minutes);
    expect(intent.title).toBe("Подготовить отчет");
  });

  it.each([
    ["Подготовить отчет 2 часа 30 минут", 150],
    ["Подготовить отчет на 1 час 15 минут", 75],
    ["Подготовить отчет 1 час 15 минут", 75],
    ["Подготовить отчет, 2 часа 30 мин", 150],
  ])("adds up the compound duration in %j -> %s minutes", async (text, minutes) => {
    const intent = await parse(text);
    expect(intent.durationMinutes).toBe(minutes);
    expect(intent.title).toBe("Подготовить отчет");
    expect(intent.confidence).toBe(0.9);
  });

  describe("relative offsets are not durations", () => {
    it.each([
      ["Позвонить клиенту через 2 часа", "Позвонить клиенту через 2 часа"],
      ["Позвонить клиенту через 30 минут", "Позвонить клиенту через 30 минут"],
      ["Позвонить клиенту через 1 час 15 минут", "Позвонить клиенту через 1 час 15 минут"],
      ["Позвонить клиенту через час", "Позвонить клиенту через час"],
      ["Позвонить клиенту через полчаса", "Позвонить клиенту через полчаса"],
    ])("%j keeps the phrase in the title and finds no duration", async (text, title) => {
      const intent = await parse(text);
      expect(intent.durationMinutes).toBeNull();
      expect(intent.title).toBe(title);
      expect(intent.confidence).toBe(0.6);
    });

    it("keeps 'на 5 минут позже' in the title and does not use the default as if it were found", async () => {
      const intent = await parse("Перенести встречу на 5 минут позже");
      expect(intent).toMatchObject({
        kind: "meeting",
        title: "Перенести встречу на 5 минут позже",
        durationMinutes: 30, // the meeting default, not 5
        confidence: 0.6,
      });
    });

    it("still reads a real duration next to a relative offset", async () => {
      const intent = await parse("Позвонить клиенту через 2 часа, на полчаса");
      expect(intent.durationMinutes).toBe(30);
      expect(intent.title).toBe("Позвонить клиенту через 2 часа");
    });
  });

  it("leaves the duration null for a task without one", async () => {
    expect((await parse("Подготовить презентацию")).durationMinutes).toBeNull();
  });

  it("ignores durations outside a plausible range instead of guessing", async () => {
    const intent = await parse("Подготовить отчет 100 часов");
    expect(intent.durationMinutes).toBeNull();
    expect(intent.title).toBe("Подготовить отчет 100 часов");
  });

  it("uses the 30 minute default for meetings and short review verbs only", async () => {
    expect((await parse("Созвон завтра")).durationMinutes).toBe(30);
    expect((await parse("Проверь письмо")).durationMinutes).toBe(30);
    expect((await parse("Напиши отчет")).durationMinutes).toBeNull();
  });
});

describe("ruleBasedIntentParser: deadlines", () => {
  it.each([
    ["Отправить отчет сегодня", "2026-09-23T20:59:00.000Z"],
    ["Отправить отчет завтра", "2026-09-24T20:59:00.000Z"],
    ["Отправить отчет послезавтра", "2026-09-25T20:59:00.000Z"],
    ["Отправить отчет до понедельника", "2026-09-28T20:59:00.000Z"],
    ["Отправить отчет до вторника", "2026-09-29T20:59:00.000Z"],
    ["Отправить отчет до среды", "2026-09-30T20:59:00.000Z"], // today is Wednesday: next Wednesday
    ["Отправить отчет до четверга", "2026-09-24T20:59:00.000Z"],
    ["Отправить отчет до пятницы", "2026-09-25T20:59:00.000Z"],
    ["Отправить отчет до субботы", "2026-09-26T20:59:00.000Z"],
    ["Отправить отчет до воскресенья", "2026-09-27T20:59:00.000Z"],
    ["Отправить отчет в четверг", "2026-09-24T20:59:00.000Z"],
    ["Отправить отчет во вторник", "2026-09-29T20:59:00.000Z"],
    ["Отправить отчет в пятницу", "2026-09-25T20:59:00.000Z"],
    ["Отправить отчет к пятнице", "2026-09-25T20:59:00.000Z"],
    ["Отправить отчет на этой неделе", "2026-09-27T20:59:00.000Z"], // end of Sunday
    ["Отправить отчет до конца недели", "2026-09-27T20:59:00.000Z"],
  ])("%s -> %s", async (text, deadline) => {
    const intent = await parse(text);
    expect(intent.deadline).toBe(deadline);
    expect(intent.title).toBe("Отправить отчет");
  });

  it("matches case-insensitively", async () => {
    expect((await parse("ОТПРАВИТЬ ОТЧЕТ ДО ПЯТНИЦЫ")).deadline).toBe("2026-09-25T20:59:00.000Z");
  });

  it("does not match weekday names in other grammatical cases", async () => {
    // "в среде" means "in an environment", not "on Wednesday".
    expect((await parse("Отправить отчет в среде разработки")).deadline).toBeNull();
  });

  it("uses the user's LOCAL date: 01:00 in Moscow is still the 24th there", async () => {
    // 2026-09-23T22:00Z is Thursday 01:00 in Moscow.
    const intent = await parse("Отправить отчет сегодня", { now: "2026-09-23T22:00:00.000Z" });
    expect(intent.deadline).toBe("2026-09-24T20:59:00.000Z");
  });

  it("computes end of day in the user's timezone across DST (Berlin, CEST after 2026-03-29)", async () => {
    const intent = await parse("Отправить отчет до понедельника", {
      now: "2026-03-27T10:00:00.000Z", // Friday, CET
      timezone: "Europe/Berlin",
    });
    expect(intent.deadline).toBe("2026-03-30T21:59:00.000Z"); // Monday 23:59 CEST (UTC+2)
  });

  it("rolls over month ends", async () => {
    const intent = await parse("Отправить отчет завтра", { now: "2026-09-30T08:00:00.000Z" });
    expect(intent.deadline).toBe("2026-10-01T20:59:00.000Z");
  });

  it("uses only the first deadline phrase and leaves later ones in the title", async () => {
    const intent = await parse("Отправить отчет завтра или до пятницы");
    expect(intent.deadline).toBe("2026-09-24T20:59:00.000Z");
  });
});

describe("ruleBasedIntentParser: kinds", () => {
  it.each([
    ["Напомни завтра позвонить маме", "reminder"],
    ["Напоминание про оплату", "reminder"],
    ["Давай созвонимся завтра", "meeting"],
    ["Встреча с командой в четверг", "meeting"],
    ["Обсудим бюджет", "meeting"],
    ["Уточнить статус у Ивана до пятницы", "follow_up"],
    ["Вернуться к вопросу про бюджет", "follow_up"],
    ["Подготовить презентацию", "task"],
    ["Надо оплатить счет", "task"],
    ["Не забудь купить билеты", "task"],
    ["Сегодня хорошая погода", "info"],
    ["Ок", "info"],
  ])("%s -> %s", async (text, kind) => {
    expect((await parse(text)).kind).toBe(kind);
  });

  it("gives reminders priority over meeting words", async () => {
    expect((await parse("напомни обсудить бюджет")).kind).toBe("reminder");
  });

  it("does not turn a bare date phrase into a task", async () => {
    const intent = await parse("Сегодня хорошая погода");
    expect(intent).toMatchObject({ kind: "info", deadline: null, durationMinutes: null, confidence: 0.3 });
  });

  it("does not read past-tense verbs as tasks", async () => {
    expect((await parse("Я сделал отчет")).kind).toBe("info");
  });
});

describe("ruleBasedIntentParser: confidence", () => {
  it("is 0.9 when a kind and a deadline or duration were found", async () => {
    expect((await parse("Подготовить презентацию до пятницы")).confidence).toBe(0.9);
    expect((await parse("Подготовить презентацию на два часа")).confidence).toBe(0.9);
  });

  it("is 0.6 when only a kind was found", async () => {
    expect((await parse("Подготовить презентацию")).confidence).toBe(0.6);
  });

  it("is 0.3 when nothing matched", async () => {
    expect((await parse("Привет")).confidence).toBe(0.3);
  });

  it("does not count default durations as found", async () => {
    // The meeting gets a default 30 minutes but neither duration nor deadline was in the text.
    expect((await parse("Созвон")).confidence).toBe(0.6);
  });
});

describe("ruleBasedIntentParser: titles", () => {
  it.each([
    ["нужно подготовить презентацию", "Подготовить презентацию"],
    ["надо бы подготовить презентацию", "Подготовить презентацию"],
    ["не забудь подготовить презентацию", "Подготовить презентацию"],
    ["Надо подготовить презентацию до пятницы!", "Подготовить презентацию"],
    ["подготовить презентацию завтра, на час.", "Подготовить презентацию"],
    ["Напомни мне позвонить маме", "Позвонить маме"],
    ["Срочно посмотри договор", "Посмотри договор"],
  ])("%j -> %j", async (text, title) => {
    expect((await parse(text)).title).toBe(title);
  });

  it("does not conjugate verbs (documented limitation)", async () => {
    expect((await parse("Посмотри договор")).title).toBe("Посмотри договор");
  });

  it("keeps the original case of proper names", async () => {
    expect((await parse("Встреча с Сергеем")).title).toBe("Встреча с Сергеем");
  });

  it("falls back to the trimmed message when cleanup would leave nothing", async () => {
    expect((await parse("нужно")).title).toBe("Нужно");
  });

  it.each(["?", "👍", "...", "!!!", " — "])(
    "never returns an empty title, even for info like %j",
    async (text) => {
      const intent = await parse(text);
      expect(intent.kind).toBe("info");
      expect(intent.title).toBe(text.trim());
    },
  );

  it("truncates very long titles", async () => {
    const intent = await parse(`Подготовить ${"очень ".repeat(60)}длинный отчет`);
    expect(Array.from(intent.title).length).toBeLessThanOrEqual(120);
    expect(intent.title.endsWith("…")).toBe(true);
  });
});

describe("ruleBasedIntentParser: priority", () => {
  it("detects urgent wording", async () => {
    expect((await parse("Срочно подготовить презентацию")).priority).toBe("high");
    expect((await parse("Подготовить презентацию asap")).priority).toBe("high");
  });

  it("detects relaxed wording, and prefers it over 'срочно' inside 'не срочно'", async () => {
    const intent = await parse("Подготовить презентацию, не срочно");
    expect(intent.priority).toBe("low");
    expect(intent.title).toBe("Подготовить презентацию");
    expect((await parse("Подготовить презентацию когда будет время")).priority).toBe("low");
  });
});

describe("ruleBasedIntentParser: priority negation", () => {
  it.each(["Не важно, посмотреть договор", "не важно посмотреть договор", "Неважно, посмотреть договор"])(
    "%j is low priority with a clean title",
    async (text) => {
      const intent = await parse(text);
      expect(intent.priority).toBe("low");
      expect(intent.title).toBe("Посмотреть договор");
    },
  );

  it("still reads plain 'важно' as high priority", async () => {
    const intent = await parse("Важно посмотреть договор");
    expect(intent.priority).toBe("high");
    expect(intent.title).toBe("Посмотреть договор");
  });
});

describe("ruleBasedIntentParser: input size", () => {
  it("accepts text at the limit and rejects anything longer", async () => {
    await expect(parse("а".repeat(MAX_INTENT_TEXT_LENGTH))).resolves.toBeDefined();
    await expect(parse("а".repeat(MAX_INTENT_TEXT_LENGTH + 1))).rejects.toThrow(InvalidIntentError);
  });

  it("checks the length before trimming, so padding cannot smuggle in a huge message", async () => {
    await expect(parse(`${" ".repeat(MAX_INTENT_TEXT_LENGTH)}нужно`)).rejects.toThrow(
      InvalidIntentError,
    );
  });

  // Regression guard against quadratic behaviour: each 8000-character input
  // must finish quickly. The budget is generous; a quadratic regex or strip
  // loop would take seconds.
  const ADVERSARIAL: readonly [string, string][] = [
    ["spaces then a letter", `${" ".repeat(MAX_INTENT_TEXT_LENGTH - 1)}а`],
    ["repeated leading noise", "нам нужно будет ".repeat(500)],
    ["repeated 'пожалуйста,'", "пожалуйста, ".repeat(660)],
    ["repeated 'нужно'", "нужно ".repeat(1333)],
    ["punctuation only", ",".repeat(MAX_INTENT_TEXT_LENGTH)],
    ["mixed edge punctuation", ",.;: !?".repeat(1142)],
    ["one long word", "встреч".repeat(1333)],
    ["one long letter run", "а".repeat(MAX_INTENT_TEXT_LENGTH)],
    ["long digit run", "9".repeat(MAX_INTENT_TEXT_LENGTH)],
    ["digit and space pairs", "1 ".repeat(4000)],
    ["repeated 'часа на'", "часа на ".repeat(1000)],
    ["repeated 'через 1 час'", "через 1 час ".repeat(660)],
    ["repeated compound duration", "1 час 1 час 1 час ".repeat(440)],
    ["repeated deadlines", "завтра ".repeat(1142)],
    ["repeated priority words", "срочно не важно ".repeat(500)],
    ["repeated participants", "встреча с Иваном и ".repeat(420)],
    ["repeated 'на'", "на ".repeat(2666)],
  ];

  it.each(ADVERSARIAL)("parses %s within the time budget", async (_label, text) => {
    expect(text.length).toBeLessThanOrEqual(MAX_INTENT_TEXT_LENGTH);
    const started = performance.now();
    await parse(text);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("ruleBasedIntentParser: participants", () => {
  it.each([
    ["Встреча с Иваном завтра", ["Иван"]],
    ["Встреча с Андреем", ["Андрей"]],
    ["Встреча с Дмитрием", ["Дмитрий"]],
    ["Встреча с Марией", ["Мария"]],
    ["Встреча с Ольгой", ["Ольга"]],
    ["Встреча с Павлом", ["Павел"]],
    ["Созвон со Львом", ["Лев"]],
    ["Встреча с Ильёй", ["Илья"]],
    ["Встреча с Ильей", ["Илья"]],
    ["Встреча с Сергеем", ["Сергей"]],
    ["Созвон с Анной и Иваном завтра", ["Анна", "Иван"]],
    ["Созвон со Светой", ["Света"]],
    ["С Сергеем нужно созвониться", ["Сергей"]],
    ["Встреча с командой", []],
    ["Созвон завтра", []],
  ])("%s -> %j", async (text, participants) => {
    expect((await parse(text)).participants).toEqual(participants);
  });

  it("only extracts participants for meetings", async () => {
    expect((await parse("Подготовить отчет с Сергеем")).participants).toEqual([]);
  });
});

describe("ruleBasedIntentParser: input validation and purity", () => {
  it.each(["", "   ", "\n\t "])("rejects empty text %j", async (text) => {
    await expect(parse(text)).rejects.toThrow(InvalidIntentError);
  });

  it("rejects an invalid timezone and an invalid now", async () => {
    await expect(parse("Подготовить отчет", { timezone: "Foo/Bar" })).rejects.toThrow(
      InvalidTimezoneError,
    );
    await expect(parse("Подготовить отчет", { now: "сейчас" })).rejects.toThrow(InvalidTimeError);
  });

  it("is deterministic", async () => {
    const text = "Нужно до пятницы подготовить презентацию, часа на два";
    await expect(parse(text)).resolves.toEqual(await parse(text));
  });

  it("ignores the source (the parser never invents slots or reads chat context)", async () => {
    const a = await createRuleBasedIntentParser().parse({
      dateTimeHints: [],
      text: "Подготовить презентацию до пятницы",
      now: NOW,
      timezone: MOSCOW,
      source: makeSource({ sourceType: "forwarded_message", hiddenOrigin: true }),
    });
    await expect(parse("Подготовить презентацию до пятницы")).resolves.toEqual(a);
  });

  it("returns a fresh participants array each time", async () => {
    const a = await parse("Встреча с Иваном");
    const b = await parse("Встреча с Иваном");
    expect(a.participants).not.toBe(b.participants);
  });
});
