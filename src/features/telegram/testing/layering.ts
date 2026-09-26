import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export type LayeringViolation = {
  readonly file: string;
  readonly specifier: string;
};

const SOURCE_FILE_PATTERN = /\.tsx?$/;

function isGrammyModule(specifier: string): boolean {
  return (
    specifier === "grammy" ||
    specifier.startsWith("grammy/") ||
    specifier.startsWith("@grammyjs/")
  );
}

function isMissingDirectory(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "ENOENT"
  );
}

async function listSourceFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // Guarded directories may not exist yet; any other failure must surface.
    if (isMissingDirectory(error)) return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
    } else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * Returns every import of `grammy` or `@grammyjs/*` (static, type-only,
 * re-export, dynamic `import()` and `require()`) found in `.ts`/`.tsx` files
 * under the given directories. Comments and strings are ignored because the
 * TypeScript scanner is used instead of a regular expression.
 * Missing directories are treated as empty.
 */
export async function findForbiddenGrammyImports(
  directories: readonly string[],
): Promise<LayeringViolation[]> {
  const violations: LayeringViolation[] = [];

  for (const directory of directories) {
    for (const file of await listSourceFiles(directory)) {
      const source = await readFile(file, "utf8");
      const { importedFiles } = ts.preProcessFile(source, true, true);
      for (const { fileName } of importedFiles) {
        if (isGrammyModule(fileName)) {
          violations.push({ file, specifier: fileName });
        }
      }
    }
  }

  return violations;
}
