# StezaAI Telegram Mini App

Эта ветка содержит мобильный Telegram Mini App: экран чата с WebGL-сценой
«чёрного ящика», liquid-glass навигацию и локальный режим превью. Работа с
Telegram-ботом, публичной DEX-ликвидностью и protocol token в scope ветки не входит.

## Быстрый старт

Требования: Node.js 20+, npm 10+ и браузер с WebGL2.

```bash
npm install
cp frontend/.env.example frontend/.env
npm run dev:frontend
```

Для запуска интерфейса без Telegram и backend авторизации:

```bash
VITE_LOCAL_PREVIEW_AUTH_BYPASS=true npm run dev:frontend
```

Флаг работает только в Vite DEV-режиме. Production-сборка всегда использует
настоящую авторизацию через Telegram `initData`.

## Проверки

```bash
npm run check          # unit-тесты + TypeScript + production build mini app
npm run security:scan  # аудит production-зависимостей mini app
npm run verify         # обе проверки последовательно
```

## Где продолжать работу

- `frontend/src/pages/ChatPage/` — чат, фазовая машина и WebGL-сцена.
- `frontend/src/components/Navigation/` — нижняя liquid-glass навигация.
- `frontend/src/components/Header/` — liquid-glass шапка.
- `frontend/src/app/providers/` — Telegram и auth-провайдеры.
- [`frontend/README.md`](frontend/README.md) — команды и устройство фронтенда.
- [`docs/chat-liquid-glass-ui.md`](docs/chat-liquid-glass-ui.md) — подробный handoff:
  реализованные механики, параметры, файлы и следующие шаги.

Сгенерированные `node_modules` и `frontend/dist`, локальные `.env` и реальные
пользовательские данные не должны попадать в git. Используйте только
`.env.example` с плейсхолдерами.
