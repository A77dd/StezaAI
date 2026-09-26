import type { File } from "grammy/types";

export type FileEntry = {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly file_size?: number;
  readonly file_path: string;
  readonly mime_type?: string;
  readonly file_name?: string;
  /** Content for files the bot uploaded; fake incoming files have none. */
  readonly bytes?: Uint8Array;
};

/** `getFile` refuses files above 20 MB ("bots can download files of up to 20MB"). */
export const GET_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** Files the fake Bot API knows: incoming attachments and documents the bot sent. */
export function createFileRegistry() {
  const files = new Map<string, FileEntry>();
  // Ids keep growing across resets, like real file ids never repeat.
  let created = 0;
  return {
    register(entry: FileEntry): void {
      files.set(entry.file_id, entry);
    },
    /** Registers a file the bot sends, with fresh ids. */
    create(input: { readonly fileName: string; readonly mimeType: string; readonly bytes?: Uint8Array }): FileEntry {
      created += 1;
      const entry: FileEntry = {
        file_id: `fake-file-${created}`,
        file_unique_id: `fake-unique-${created}`,
        file_path: `documents/${input.fileName}`,
        file_name: input.fileName,
        mime_type: input.mimeType,
        ...(input.bytes === undefined ? {} : { file_size: input.bytes.length, bytes: input.bytes }),
      };
      files.set(entry.file_id, entry);
      return entry;
    },
    get(fileId: string): FileEntry | undefined {
      return files.get(fileId);
    },
    has(fileId: string): boolean {
      return files.has(fileId);
    },
    list(): readonly FileEntry[] {
      return [...files.values()];
    },
    /** The `File` object `getFile` returns. */
    toFile(entry: FileEntry): File {
      return {
        file_id: entry.file_id,
        file_unique_id: entry.file_unique_id,
        ...(entry.file_size === undefined ? {} : { file_size: entry.file_size }),
        file_path: entry.file_path,
      };
    },
    clear(): void {
      files.clear();
    },
  };
}

export type FileRegistry = ReturnType<typeof createFileRegistry>;
