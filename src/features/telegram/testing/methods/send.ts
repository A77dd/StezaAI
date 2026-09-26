import type { InputFile } from "grammy";
import type { Message } from "grammy/types";
import type { Payload } from "../validation/guards";
import { ApiRejection } from "../validation/rejection";
import type { FileEntry } from "../state/fileRegistry";
import type { FakeState } from "../state/fakeState";
import type { DocumentSource } from "../validation/messages";
import { readSendDocument, readSendMessage, readSendRichMessage } from "../validation/messages";
import { messageLookup } from "./context";
import type { MethodContext, MethodHandler } from "./context";
import { deliverToChat } from "./outbound";

/**
 * "Multipart upload: photos up to 10 MB, everything else up to 50 MB" (research 5.5).
 * UNVERIFIED: the 413 answer for a larger upload.
 */
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  ics: "text/calendar",
  pdf: "application/pdf",
  zip: "application/zip",
};

export const sendMessage: MethodHandler = (context, payload) => {
  const request = readSendMessage(payload, messageLookup(context));
  return deliverToChat(context.state, request.params, {
    kind: "text",
    text: request.text,
    linkPreview: request.linkPreview,
  });
};

export const sendRichMessage: MethodHandler = (context, payload) => {
  const request = readSendRichMessage(payload, messageLookup(context));
  return deliverToChat(context.state, request.params, { kind: "rich", rich: request.rich });
};

async function readBytes(file: InputFile): Promise<Uint8Array> {
  const raw = await file.toRaw();
  if (raw instanceof Uint8Array) return raw;
  const chunks: Uint8Array[] = [];
  for await (const chunk of raw) chunks.push(chunk);
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function mimeTypeOf(fileName: string): string {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

async function resolveDocument(state: FakeState, source: DocumentSource): Promise<FileEntry> {
  if (source.kind === "file_id") {
    const known = state.files.get(source.fileId);
    if (known === undefined) throw new Error("readSendDocument accepted an unknown file_id");
    return known;
  }
  if (source.kind === "url") {
    const fileName = new URL(source.url).pathname.split("/").at(-1) ?? "file";
    return state.files.create({ fileName, mimeType: mimeTypeOf(fileName) });
  }
  const bytes = await readBytes(source.file);
  if (bytes.length > UPLOAD_MAX_BYTES) throw new ApiRejection(413, "Request Entity Too Large");
  const fileName = source.file.filename ?? "file";
  return state.files.create({ fileName, mimeType: mimeTypeOf(fileName), bytes });
}

/** `sendDocument`; an uploaded file's bytes are kept in the file registry for `/export` tests. */
export async function sendDocument(context: MethodContext, payload: Payload): Promise<Message> {
  const { state } = context;
  const request = readSendDocument(payload, messageLookup(context), (fileId) => state.files.has(fileId));
  const entry = await resolveDocument(state, request.document);
  return deliverToChat(state, request.params, {
    kind: "document",
    caption: request.caption,
    document: {
      file_id: entry.file_id,
      file_unique_id: entry.file_unique_id,
      ...(entry.file_name === undefined ? {} : { file_name: entry.file_name }),
      ...(entry.mime_type === undefined ? {} : { mime_type: entry.mime_type }),
      ...(entry.file_size === undefined ? {} : { file_size: entry.file_size }),
    },
  });
}
