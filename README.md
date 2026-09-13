# StezaAI

«Стезя» — privacy-first проактивный AI-агент для профессиональной жизни. Он связывает разрешённый рабочий контекст с персональной памятью и помогает выбрать следующее полезное действие.

Текущий вертикальный срез — первый экран онбординга: интерактивная сфера профессионального контекста с переходом по кнопке «Начать».

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

В репозитории пока реализован только web-entry онбординга. Desktop Context Node, backend, персональная память, AI orchestration и аналитика описаны как следующие границы, но не созданы преждевременно.
