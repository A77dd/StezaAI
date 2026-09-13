import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Стезя",
    short_name: "Стезя",
    description:
      "Проактивный AI-агент для профессионального контекста и следующего полезного действия.",
    start_url: "/",
    display: "standalone",
    background_color: "#020304",
    theme_color: "#020304",
    lang: "ru",
  };
}

