import type { ProfileLookup } from "./profileLookup";
import type { ProfileResult, ProfileSourceId } from "./profileSources.types";

type ProfileLookupErrorCode = "invalid-query" | "not-found";

export class ProfileLookupError extends Error {
  constructor(
    public readonly code: ProfileLookupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProfileLookupError";
  }
}

const MOCK_PROFILES: Record<ProfileSourceId, ProfileResult> = {
  linkedin: {
    sourceId: "linkedin",
    name: "Профиль специалиста",
    role: "Product Lead · digital products",
    avatarPath: "/onboarding/avatars/profile-blue.svg",
  },
  hh: {
    sourceId: "hh",
    name: "Профиль кандидата",
    role: "Руководитель продукта",
    avatarPath: "/onboarding/avatars/profile-cyan.svg",
  },
  github: {
    sourceId: "github",
    name: "Профиль разработчика",
    role: "Software Engineer · open source",
    avatarPath: "/onboarding/avatars/profile-violet.svg",
  },
  telegram: {
    sourceId: "telegram",
    name: "Публичный профиль",
    role: "Автор · технологии и продукты",
    avatarPath: "/onboarding/avatars/profile-mint.svg",
  },
  setka: {
    sourceId: "setka",
    name: "Профессиональный профиль",
    role: "Дизайн · продуктовые команды",
    avatarPath: "/onboarding/avatars/profile-indigo.svg",
  },
};

type MockProfileLookupOptions = {
  delayMs?: number;
};

export function createMockProfileLookup({
  delayMs = 650,
}: MockProfileLookupOptions = {}): ProfileLookup {
  return {
    async lookup(sourceId, query) {
      const normalizedQuery = query.trim();

      if (!normalizedQuery) {
        throw new ProfileLookupError(
          "invalid-query",
          "Добавьте ссылку или @handle.",
        );
      }

      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }

      if (normalizedQuery.toLowerCase() === "error") {
        throw new ProfileLookupError(
          "not-found",
          "Не удалось найти профиль. Проверьте ссылку или @handle.",
        );
      }

      return MOCK_PROFILES[sourceId];
    },
  };
}

export const mockProfileLookup = createMockProfileLookup();
