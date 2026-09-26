import type { FakeBotApi, RecordedCall } from "./fakeBotApi";
import { readMessageText, readOptionalCaption } from "./validation/text";

/** Anything with a fake Bot API: a `TelegramTestKit` or `{ fake }`. */
export type FakeHolder = { readonly fake: FakeBotApi };

/**
 * What a payload must contain. Objects match as subsets (extra fields are
 * fine), arrays match element by element, functions are predicates, regular
 * expressions test strings, and values with `asymmetricMatch` (such as
 * Vitest's `expect.stringContaining`) are asked to match.
 */
export type CallMatcher = Readonly<Record<string, unknown>> | ((payload: Readonly<Record<string, unknown>>) => boolean);

function hasAsymmetricMatch(value: unknown): value is { asymmetricMatch(actual: unknown): boolean } {
  return typeof value === "object" && value !== null && "asymmetricMatch" in value && typeof value.asymmetricMatch === "function";
}

function matches(actual: unknown, expected: unknown): boolean {
  if (hasAsymmetricMatch(expected)) return expected.asymmetricMatch(actual);
  if (typeof expected === "function") return Boolean((expected as (value: unknown) => unknown)(actual));
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => matches(actual[i], item));
  }
  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null) return false;
    const record = actual as Readonly<Record<string, unknown>>;
    return Object.entries(expected).every(([key, value]) => matches(record[key], value));
  }
  return Object.is(actual, expected);
}

function describeCalls(calls: readonly RecordedCall[]): string {
  if (calls.length === 0) return "  (none)";
  return calls
    .map((call) => `  #${call.seq} ${call.method} ${JSON.stringify(call.payload)} -> ${call.outcome.kind}`)
    .join("\n");
}

/**
 * Asserts the bot made a call to `method` whose payload matches, and returns
 * the first such call. The failure lists the calls to that method.
 */
export function expectCall(holder: FakeHolder, method: string, matcher: CallMatcher = {}): RecordedCall {
  const candidates = holder.fake.callsTo(method);
  const found = candidates.find((call) =>
    typeof matcher === "function" ? matcher(call.payload) : matches(call.payload, matcher),
  );
  if (found === undefined) {
    const wanted = typeof matcher === "function" ? "a payload accepted by the predicate" : JSON.stringify(matcher);
    throw new Error(`expected a call to ${method} matching ${wanted}; calls to ${method}:\n${describeCalls(candidates)}`);
  }
  return found;
}

/** Asserts the bot made no Bot API call at all, or none to `method`. */
export function expectNoCalls(holder: FakeHolder, method?: string): void {
  const calls = method === undefined ? holder.fake.calls : holder.fake.callsTo(method);
  if (calls.length > 0) {
    throw new Error(`expected no calls${method === undefined ? "" : ` to ${method}`}, got ${calls.length}:\n${describeCalls(calls)}`);
  }
}

/** Asserts the callback query was answered by exactly one successful `answerCallbackQuery`. */
export function expectCallbackAnsweredOnce(holder: FakeHolder, callbackQueryId: string): void {
  const answers = holder.fake.callsTo("answerCallbackQuery").filter((call) => call.payload.callback_query_id === callbackQueryId);
  if (answers.length === 0) {
    throw new Error(`callback query ${callbackQueryId} was never answered; pending: ${holder.fake.pendingCallbackIds.join(", ") || "none"}`);
  }
  if (answers.length > 1) {
    throw new Error(`callback query ${callbackQueryId} was answered ${answers.length} times:\n${describeCalls(answers)}`);
  }
  if (answers[0]?.outcome.kind !== "ok") {
    throw new Error(`the only answer to callback query ${callbackQueryId} failed:\n${describeCalls(answers)}`);
  }
}

/**
 * The text a reader sees for a call that sends or edits text: markup parsed by
 * the independent HTML oracle, `&amp;` decoded, tags removed. For
 * `sendDocument` and captions it is the caption.
 */
export function expectRenderedText(call: RecordedCall): string {
  const { payload } = call;
  if (payload.rich_message !== undefined) {
    throw new Error(`${call.method} sends a rich message; assert on payload.rich_message directly`);
  }
  if (typeof payload.text === "string") return readMessageText(payload).text;
  const caption = readOptionalCaption(payload);
  if (caption !== undefined) return caption.text;
  throw new Error(`${call.method} has no text or caption to render`);
}
