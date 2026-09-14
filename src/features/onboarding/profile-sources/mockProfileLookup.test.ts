import { describe, expect, it } from "vitest";

import { PROFILE_SOURCES } from "./profileSources.config";
import {
  createMockProfileLookup,
  ProfileLookupError,
} from "./mockProfileLookup";

describe("mockProfileLookup", () => {
  it("returns source-specific synthetic profiles", async () => {
    const lookup = createMockProfileLookup({ delayMs: 0 });

    for (const source of PROFILE_SOURCES) {
      const result = await lookup.lookup(source.id, "@demo");

      expect(result.sourceId).toBe(source.id);
      expect(result.name).toBeTruthy();
      expect(result.role).toBeTruthy();
      expect(result.avatarPath).toMatch(/^\/onboarding\/avatars\//);
    }
  });

  it("rejects an empty query", async () => {
    const lookup = createMockProfileLookup({ delayMs: 0 });

    await expect(lookup.lookup("github", "   ")).rejects.toMatchObject({
      code: "invalid-query",
    });
  });

  it("uses the reserved error query to expose the retry state", async () => {
    const lookup = createMockProfileLookup({ delayMs: 0 });

    await expect(lookup.lookup("github", "error")).rejects.toBeInstanceOf(
      ProfileLookupError,
    );
    await expect(lookup.lookup("github", "error")).rejects.toMatchObject({
      code: "not-found",
      message: "Не удалось найти профиль. Проверьте ссылку или @handle.",
    });
  });
});
