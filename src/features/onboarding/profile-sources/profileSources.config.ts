import type { ProfileSource } from "./profileSources.types";

export const PROFILE_SOURCES = [
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Опыт, роли и профессиональные связи",
    mark: "in",
    accent: "blue",
  },
  {
    id: "hh",
    name: "hh.ru",
    description: "Резюме, навыки и карьерные ожидания",
    mark: "hh",
    accent: "cyan",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Проекты, код и технический вклад",
    mark: "GH",
    accent: "violet",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Публичный профиль и профессиональный контекст",
    mark: "TG",
    accent: "mint",
  },
  {
    id: "setka",
    name: "Сетка",
    description: "Роль, интересы и профессиональное окружение",
    mark: "С",
    accent: "indigo",
  },
] as const satisfies readonly ProfileSource[];
