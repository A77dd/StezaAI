import type { Composer } from "grammy";
import type { Intent, Slot, SourceRef, Task } from "../../domain";
import { createBookMeeting } from "../../domain/useCases";
import type { BotContext } from "../../bot";
import { createDraftStream, createEditStream, describeError, sendCard, sendDocument } from "../../bot";
import type { DraftStreamDeps, EditStreamDeps } from "../../bot";
import {
  demoDoneView,
  helpRichView,
  helpView,
  settingsView,
  welcomeRichView,
  welcomeView,
} from "../../render";
import type { HelpCommand, ViewContext } from "../../render";
import { renderDeleteConfirmation } from "./dataCallbacks";
import { sendMeetingBookedOutcome, sendProposalCard } from "./outcomes";

/** Commands implemented by this task; `/help` must never advertise more than this. */
const AVAILABLE_COMMANDS: readonly HelpCommand[] = ["start", "help", "settings", "export", "deleteme"];

const EXPORT_FILE_NAME = "steza-export.json";

function userIdOf(ctx: BotContext): string {
  // Every command handler here runs on a `message` update with a `from`
  // (grammY guarantees this for `.command`); a missing one is a bug upstream.
  if (ctx.from === undefined) throw new Error("command handler: the update has no user");
  return String(ctx.from.id);
}

/**
 * `/demo` (scenario I): simulates a streaming LLM answer, so the mechanics —
 * gradual text, the Stop button, the final card — can be exercised on a real
 * device before any model is connected. Private chats stream drafts; groups
 * get the edit-based fallback (one message, edited at most once per second).
 * Not advertised in `/help`. `streamOptions` exists for tests; production
 * uses the defaults.
 */
export async function runDemoStream(
  ctx: BotContext,
  viewCtx: ViewContext,
  streamOptions: Partial<Pick<DraftStreamDeps, "throttleMs" | "pacingMs"> & Pick<EditStreamDeps, "throttleMs" | "pacingMs">> = {},
): Promise<void> {
  if (ctx.chat === undefined) throw new Error("demo stream: the update has no chat");

  if (ctx.chat.type === "private") {
    const stream = createDraftStream({
      api: ctx.api,
      registry: ctx.services.draftStreams,
      logger: ctx.services.logger,
      chatId: ctx.chat.id,
      ...streamOptions,
    });
    ctx.log.info("stream.started", { draftId: stream.draftId });
    try {
      await stream.begin();
      for (const paragraph of viewCtx.catalog.demo.paragraphs) {
        if (stream.stopped) return; // the Stop press already removed the draft
        await stream.pushPaced(paragraph + "\n\n");
      }
      await stream.finish(async () => {
        await sendCard(ctx, demoDoneView(viewCtx));
      });
      ctx.log.info("stream.finished", { draftId: stream.draftId });
    } catch (error) {
      stream.release();
      throw error;
    }
    return;
  }

  // Edit-based fallback (research §4.9, USE NOW): groups and topics have no
  // drafts, so the progress lives in one ordinary message, edited at most
  // once per second, with the final card as the last edit.
  const stream = createEditStream({
    api: ctx.api,
    logger: ctx.services.logger,
    chatId: ctx.chat.id,
    threadId: ctx.msg?.is_topic_message === true ? ctx.msg.message_thread_id : undefined,
    thinkingText: viewCtx.catalog.stream.thinking,
    ...streamOptions,
  });
  ctx.log.info("stream.started", { transport: "edit" });
  try {
    await stream.begin();
    for (const paragraph of viewCtx.catalog.demo.paragraphs) {
      await stream.pushPaced(paragraph + "\n\n");
    }
    const finalCard = demoDoneView(viewCtx);
    if (finalCard.kind !== "text") throw new Error("demo stream: the final edit needs a text card");
    await stream.finish(finalCard.text);
    ctx.log.info("stream.finished", { transport: "edit" });
  } catch (error) {
    stream.release();
    throw error;
  }
}

/** `/start`, `/help`, `/settings`, `/export`, `/deleteme` (Task 7: scenario A). */
export function registerCommands(composer: Composer<BotContext>): void {
  composer.command("start", async (ctx) => {
    const userId = userIdOf(ctx);
    const { settings } = await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const viewCtx = ctx.viewContext(settings);
    const input = { firstName: ctx.from?.first_name ?? null, calendarConnected: settings.calendarConnected };
    try {
      await sendCard(ctx, welcomeRichView(input, viewCtx));
    } catch (error) {
      ctx.log.warn("welcome.rich_fallback", describeError(error));
      await sendCard(ctx, welcomeView(input, viewCtx));
    }
  });

  composer.command("help", async (ctx) => {
    const viewCtx = ctx.viewContext(await ctx.loadSettings());
    // Rich pilot (research §5.2): long structured content goes out as a Rich
    // Message; if the Bot API or the client rejects it, the HTML card is the
    // fallback. Nothing has been sent when the fallback kicks in.
    try {
      await sendCard(ctx, helpRichView({ availableCommands: AVAILABLE_COMMANDS }, viewCtx));
    } catch (error) {
      ctx.log.warn("help.rich_fallback", describeError(error));
      await sendCard(ctx, helpView({ availableCommands: AVAILABLE_COMMANDS }, viewCtx));
    }
  });

  composer.command("settings", async (ctx) => {
    const userId = userIdOf(ctx);
    const { settings } = await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const viewCtx = ctx.viewContext(settings);
    await sendCard(ctx, settingsView(settings, viewCtx));
  });

  composer.command("export", async (ctx) => {
    const userId = userIdOf(ctx);
    const data = await ctx.services.personalFlow.exportUserData({ userId });
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
    await sendDocument(ctx, EXPORT_FILE_NAME, bytes);
  });

  composer.command("deleteme", async (ctx) => {
    const viewCtx = ctx.viewContext(await ctx.loadSettings());
    await sendCard(ctx, renderDeleteConfirmation(viewCtx));
  });

  // A sample interactive rich calendar with real slots: a day press opens the
  // day view, a slot press books it — the whole proposal scenario in one command.
  composer.command("demo_calendar", async (ctx) => {
    if (ctx.from === undefined || ctx.chat === undefined) return;
    const userId = String(ctx.from.id);
    await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const settings = await ctx.services.settings.get(userId);
    if (settings === null) throw new Error("demo_calendar: settings disappeared after startUser");

    const now = Date.parse(ctx.services.clock.now());
    const slotAt = (dayOffset: number, hourUtc: number): Slot => {
      const start = new Date(now + dayOffset * 24 * 60 * 60 * 1000);
      start.setUTCHours(hourUtc, 0, 0, 0);
      return { start: start.toISOString(), end: new Date(start.getTime() + 60 * 60 * 1000).toISOString() };
    };
    const task: Task = {
      id: ctx.services.ids.next("task"),
      userId,
      title: "Демо: подготовить отчёт",
      kind: "task",
      deadline: null,
      durationMinutes: 60,
      priority: "normal",
      source: demoSource(ctx),
      status: "proposed",
      createdAt: ctx.services.clock.now(),
      bookingId: null,
    };
    await ctx.services.tasks.create(task);
    const proposal = await ctx.services.proposals.save(userId, {
      taskId: task.id,
      slots: [slotAt(1, 10), slotAt(1, 14), slotAt(3, 11)],
      createdAt: ctx.services.clock.now(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    });
    const viewCtx = ctx.viewContext(settings);
    await sendProposalCard(ctx, { kind: "proposed", task, proposal }, viewCtx);
  });

  // A sample meeting booking with the interactive card: reminder toggle,
  // time change through the busy-aware calendar, delete, details capture.
  composer.command("demo_meeting", async (ctx) => {
    if (ctx.from === undefined || ctx.chat === undefined) return;
    const userId = String(ctx.from.id);
    await ctx.services.personalFlow.startUser({ userId, locale: ctx.locale });
    const settings = await ctx.services.settings.get(userId);
    if (settings === null) throw new Error("demo_meeting: settings disappeared after startUser");

    const intent: Intent = {
      kind: "meeting",
      title: "Демо: встреча с командой",
      deadline: null,
      durationMinutes: 60,
      scheduledStartAt: new Date(Date.parse(ctx.services.clock.now()) + 2 * 60 * 60 * 1000).toISOString(),
      priority: "normal",
      participants: [],
      confidence: 1,
    };
    // A previously booked demo may occupy the slot: shift the start until the
    // hour is free BEFORE booking, so no doomed proposal tasks are left behind.
    let startMs = Date.parse(intent.scheduledStartAt!);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate: Slot = { start: new Date(startMs).toISOString(), end: new Date(startMs + 60 * 60 * 1000).toISOString() };
      if ((await ctx.services.calendar.getBusyIntervals(userId, candidate)).length === 0) break;
      startMs += 60 * 60 * 1000;
    }
    const book = createBookMeeting(ctx.services);
    const result = await book({ userId, intent: { ...intent, scheduledStartAt: new Date(startMs).toISOString() }, source: demoSource(ctx) });
    if (result.kind !== "meeting_booked") {
      const viewCtx = ctx.viewContext(settings);
      await sendCard(ctx, demoDoneView(viewCtx));
      return;
    }
    const viewCtx = ctx.viewContext(settings);
    await sendMeetingBookedOutcome(ctx, userId, result.task, result.booking.slot, viewCtx);
  });

  composer.command("demo", (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const started = (async () => ctx.viewContext(await ctx.loadSettings()))();
    // Returns before generating: the chat queue must stay free so the
    // `stopped_message_generation` update is not held back by `sequentialize`.
    void started
      .then((viewCtx) => runDemoStream(ctx, viewCtx))
      .catch((error: unknown) => {
        ctx.log.error("stream.failed", describeError(error));
      });
  });
}

/** A source ref for demo-created tasks: private chat provenance, like a typed message. */
function demoSource(ctx: BotContext): SourceRef {
  const message = ctx.message;
  if (message === undefined) throw new Error("demo: the command update has no message");
  return {
    sourceType: "direct_message",
    sourceChatId: message.chat.id,
    sourceMessageId: message.message_id,
    relatedMessageIds: [],
    sourceText: "/demo",
    sourceAuthor: null,
    sourceTimestamp: new Date(message.date * 1000).toISOString(),
    hiddenOrigin: false,
  };
}
