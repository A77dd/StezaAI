# StezaAI Mini App (frontend)

Telegram Mini App на React 18 + Vite 5 + TypeScript. Сцена чата («чёрный ящик») — WebGL2, стилистика liquid glass.

## Запуск

Требования: Node.js 20+, npm 10+ и браузер с WebGL2. Устанавливать зависимости
нужно из корня репозитория, чтобы использовался общий workspace-lockfile.

```bash
npm install
cp frontend/.env.example frontend/.env
npm run dev:frontend        # http://localhost:5173
```

### Без бэкенда (локальное превью)

Гостевой пользователь подставляется автоматически, redirect на `/auth` не происходит:

```bash
VITE_LOCAL_PREVIEW_AUTH_BYPASS=true npm run dev:frontend
```

Флаг действует только в `DEV`-режиме (`import.meta.env.DEV`) и не влияет на production-сборку. Реальная авторизация — Telegram `initData` → `/auth/telegram` (см. `src/app/providers/AuthProvider.tsx`).

### Отладочная панель сцены

Панель Tweakpane (Glass Spinner Lab) скрыта от пользователей и включается URL-флагом:

- `?sphere-debug=1` — включить (запоминается в `localStorage.sphereDebug`)
- `?sphere-debug=0` — выключить

Внутри: формат сцены (Auto/Dark/Light), масштаб бабла, пресеты состояний rest/thinking, виньетка, точечный паттерн. Подробности — `docs/chat-liquid-glass-ui.md`.

## Сборка

```bash
npm run check          # тесты + tsc + vite build
npm run security:scan  # production dependency audit
npm run verify         # полная проверка перед review
```

TypeScript закреплён на `~5.9.0`: флагу `ignoreDeprecations` в `tsconfig.json`
нужно значение `"5.0"`. Для типов tweakpane v3 требуется dev-зависимость
`@tweakpane/core` (в самом пакете она не объявлена). Production-зависимости
`axios` и `react-router-dom` подняты до версий без известных npm audit проблем.

## Структура

- `src/pages/ChatPage/` — чат: сцена чёрного ящика, поле ввода
- `src/pages/ChatPage/BlackBoxSphere.tsx` — WebGL-сцена (метаболлы, оптика, текст за каплей)
- `src/pages/ChatPage/sceneAnimation.ts` — правила паузы анимации и reduced motion
- `src/components/Navigation/` — нижняя навигация, liquid glass, ThinkingOrb
- `src/components/Header/` — шапка, liquid glass
- `src/app/providers/` — Telegram/Auth провайдеры
