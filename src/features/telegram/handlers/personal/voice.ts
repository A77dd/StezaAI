import type { Composer } from "grammy";
import { TranscriptionUnavailableError } from "../../domain";
import type { SourceRef } from "../../domain";
import type { BotContext } from "../../bot";
import { sendCard } from "../../bot";
import { noticeForKind } from "../../render";
import type { NoticeKind } from "../../render";
import { submitMessage } from "./submitMessage";

const MAX_VOICE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["audio/ogg", "audio/opus"]);

async function sendVoiceNotice(ctx: BotContext, kind: NoticeKind): Promise<void> {
  await sendCard(ctx, noticeForKind(kind, ctx.viewContext(await ctx.loadSettings())).message);
}

export function registerVoice(composer: Composer<BotContext>): void {
  composer.on("message:voice", async (ctx, next) => {
    if (ctx.from === undefined || ctx.chat === undefined) {
      await next();
      return;
    }
    const download = ctx.services.voiceFileDownload;
    if (download === null) {
      ctx.log.info("voice.unavailable");
      await sendVoiceNotice(ctx, "voice_unavailable");
      return;
    }
    const voice = ctx.message.voice;
    if (voice.file_size !== undefined && voice.file_size > MAX_VOICE_BYTES) {
      ctx.log.info("voice.too_large");
      await sendVoiceNotice(ctx, "voice_too_large");
      return;
    }
    const mimeType = voice.mime_type;
    if (mimeType === undefined || !SUPPORTED_MIME_TYPES.has(mimeType)) {
      ctx.log.info("voice.unsupported_mime");
      await sendVoiceNotice(ctx, "voice_unsupported");
      return;
    }

    const file = await ctx.api.getFile(voice.file_id);
    if (file.file_path === undefined) {
      ctx.log.warn("voice.file_path_unavailable");
      await sendVoiceNotice(ctx, "voice_unavailable");
      return;
    }
    if (file.file_size !== undefined && file.file_size > MAX_VOICE_BYTES) {
      ctx.log.info("voice.too_large");
      await sendVoiceNotice(ctx, "voice_too_large");
      return;
    }
    const audio = await download.download(file.file_path);
    if (audio.byteLength > MAX_VOICE_BYTES) {
      ctx.log.info("voice.too_large");
      await sendVoiceNotice(ctx, "voice_too_large");
      return;
    }
    let transcript: string;
    try {
      transcript = (await ctx.services.transcription.transcribe({
        audio,
        mimeType,
        ...(ctx.from.language_code === undefined ? {} : { languageHint: ctx.from.language_code }),
      })).text.trim();
    } catch (error) {
      if (!(error instanceof TranscriptionUnavailableError)) throw error;
      ctx.log.warn("voice.transcription_unavailable");
      await sendVoiceNotice(ctx, "transcription_unavailable");
      return;
    }
    if (transcript === "") {
      ctx.log.warn("voice.empty_transcript");
      await sendVoiceNotice(ctx, "transcription_unavailable");
      return;
    }

    const source: SourceRef = {
      sourceType: "direct_message",
      sourceChatId: ctx.chat.id,
      sourceMessageId: ctx.message.message_id,
      relatedMessageIds: [],
      sourceText: transcript,
      sourceAuthor: null,
      sourceTimestamp: new Date(ctx.message.date * 1000).toISOString(),
      hiddenOrigin: false,
    };
    await submitMessage(ctx, { text: transcript, source, dateTimeHints: [] });
  });
}
