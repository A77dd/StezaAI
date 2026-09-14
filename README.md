# StezaAI

«Стезя» — privacy-first проактивный AI-агент для профессиональной жизни. Он связывает разрешённый рабочий контекст с персональной памятью и помогает выбрать следующее полезное действие.

Текущий вертикальный срез — мобильный web-онбординг: интерактивное интро и необязательное подтверждение профилей LinkedIn, hh.ru, GitHub, Telegram и Сетка. Поиск профилей использует синтетический локальный mock за отдельным контрактом; backend и импорт данных пока не подключены.

## Быстрый старт

```bash
nvm use
npm ci
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Проверки

```bash
npm run check
npm run verify
```

`check` запускает lint, typecheck и тесты. `verify` дополнительно собирает production-версию.

## Документация

- [Контекст продукта](docs/product/PRODUCT_CONTEXT.md)
- [Sber500 x DISRUPT](docs/research/SBER500_X_DISRUPT.md)
- [Архитектура MVP](docs/architecture/MVP.md)
- [Решение о web-фундаменте](docs/decisions/0001-web-foundation.md)
- [Правила участия в разработке](CONTRIBUTING.md)
- [Правила для инженерных агентов](AGENTS.md)

## Статус границ

В репозитории реализован только web-entry онбординга с mock-поиском профилей. Desktop Context Node, backend, персональная память, AI orchestration и аналитика описаны как следующие границы, но не созданы преждевременно.
