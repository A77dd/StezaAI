# Telegram Bot API: каталог возможностей для Telegram-native агента планирования

Дата исследования: **2026-09-26**. Исследование первичное: страницы core.telegram.org скачаны целиком (curl) 2026-09-26 и прочитаны по разделам; версии пакетов проверены через `npm view` / `npm pack` и PyPI в тот же день. Ничего не взято из памяти без сверки с документацией: где документация молчит, это явно помечено.

Назначение: справочник для команды, которая строит персонального AI-агента планирования (русскоязычные пользователи) внутри Telegram. Код здесь не пишется.

## Как читать документ

- **Факт (из документации)** — то, что прямо сказано на страницах core.telegram.org (ссылки с якорями рядом).
- **Предположение команды** — наш вывод, интерпретация или инженерное решение. В документе всегда оформляется цитатой с префиксом «Предположение команды».
- **Вердикт** для нашего продукта: `USE NOW` (делаем в первой версии), `USE LATER` (осознанно откладываем, есть ценность), `DON'T USE` (не нужно или вредно для продукта).
- Сценарии продукта, на которые ссылаются вердикты:
  - **A** — личная задача в приватном чате, агент предлагает 1–3 слота кнопками [Поставить] [Другое время] [Изменить].
  - **B** — пересланное сообщение, классификация намерения.
  - **C** — группа: молчим, пока нет reply или @mention.
  - **D** — inline-режим.
  - **E** — контекст PERSONAL против CHAT.
  - **F** — Mini App (Today / Week / Inbox / Insights / Settings).
  - **G** — напоминания и пост-блочный check-in «Как прошло?».
  - **H** — голосовые сообщения и распознавание речи.
  - **I** — стриминг ответа LLM в сообщение.

## Основные источники

| Страница | URL |
|---|---|
| Bot API (справочник) | https://core.telegram.org/bots/api |
| Bot API changelog | https://core.telegram.org/bots/api-changelog |
| Bot Features | https://core.telegram.org/bots/features |
| Mini Apps | https://core.telegram.org/bots/webapps |
| Inline Bots | https://core.telegram.org/bots/inline |
| Bots FAQ | https://core.telegram.org/bots/faq |
| Webhooks guide | https://core.telegram.org/bots/webhooks |
| Payments (кратко) | https://core.telegram.org/bots/payments |
| Telegram Login (OIDC) | https://core.telegram.org/bots/telegram-login |
| Библиотеки-примеры | https://core.telegram.org/bots/samples |

---

# 1. Краткое резюме

## 1.1 Актуальная версия

**Факт.** Последняя версия Bot API на 2026-09-26 — **Bot API 10.3, релиз 24 августа 2026** ([changelog](https://core.telegram.org/bots/api-changelog#august-24-2026)). Более новых записей на странице нет.

**Факт.** Платформа резко ушла вперёд от версий 7.x–8.x: за последние ~24 месяца вышли 7.10 → 10.3 (17 релизов, см. раздел 2). Появились принципиально новые для нас слои: Rich Messages (10.1), стриминг черновиков (9.3/9.5), Ephemeral Messages (10.2), Guest Mode (10.0), приватные темы (9.3), стили кнопок (9.4), `date_time` entity (9.5).

## 1.2 Десять главных находок для нашего продукта

1. **`sendMessageDraft` существует и открыт всем ботам** (введён в 9.3, «все боты» с 9.5). Это нативный стриминг черновика в приватном чате. Черновик — «временное 30-секундное превью», финал надо отправить `sendMessage`. Есть кнопка «Стоп» (`can_stop`) и апдейт `stopped_message_generation` (10.3).
2. **Rich Messages (10.1, 2026-06-11)**: `sendRichMessage` принимает GitHub-flavored Markdown или HTML (заголовки, таблицы, списки задач, `<details>`, формулы, карты) до 32768 символов. LLM-markdown можно отдавать почти напрямую, без MarkdownV2-экранирования. Внутри сообщения можно размещать inline-кнопки (`<tg-button>`).
3. **`date_time` entity (9.5)**: тег `<tg-time unix=".." format="wDt">` показывает время в локальной зоне читателя. Бот также получает такие entity во входящих сообщениях с точным `unix_time`. Для планировщика это лучший способ показывать слоты без ручного форматирования.
4. **Стили кнопок (9.4)**: `style` = `primary` / `success` / `danger` для inline- и reply-кнопок; `DisabledButton` и `force_reply` в разметке (10.3). Кнопки [Поставить] / [Отмена] можно красить нативно.
5. **`has_mention` не существует.** Упоминание определяется по `entities` (`mention` с `@username` бота, `text_mention`, `bot_command` с `@bot`) и по `reply_to_message`. Это ответ на вопрос про сценарий C.
6. **Privacy mode: @mention в списке доставляемых сообщений не значится.** Документация перечисляет команды `/cmd@bot`, «общие» команды (если бот последний писал), сообщения «через бота» и reply на сообщения бота. Обычный текст с `@bot` в перечне нет. Нужно проверять руками (раздел 12).
7. **Guest Mode (10.0)** — официальный способ «позвать» бота @mention в любом чате без добавления в группу; бот получает `guest_message` и один раз отвечает `answerGuestQuery`. Для сценария C это альтернатива privacy mode.
8. **Ephemeral Messages (10.2/10.3)**: ответ «только для одного участника группы» (`ephemeral_message_parameters`), в том числе «поверх» исходного сообщения после нажатия inline-кнопки. Окно — 15 секунд после действия пользователя (если бот не админ). Для сценариев C и E — сильный инструмент приватности в группе.
9. **Mini App**: подпись `initData` теперь проверяется двумя способами (HMAC-SHA256 с токеном бота и Ed25519 для третьих сторон, 8.0). С 20 июля 2026 включена защита: методы Mini App не работают с чужих origin (10.2), отключается только через BotFather.
10. **Нет, а ожидаешь:** у Bot API нет часового пояса пользователя, нет нативной транскрипции голосовых, нет отложенной отправки (`schedule_date`) для сообщений бота, нет списка `message_effect_id` в документации, checklist-ы бот шлёт только от имени business-аккаунта. Напоминания и таймзоны — целиком наша ответственность.

## 1.3 Версия grammY

**Факт (npm, 2026-09-26).** `grammy` **1.46.0** (опубликован 2026-08-26), зависит от `@grammyjs/types` **5.0.0** (2026-08-25). README grammy 1.46.0 содержит бейдж «Bot API 10.3»; в типах присутствуют `sendRichMessage`, `sendRichMessageDraft`, `sendMessageDraft` (с `can_stop`), `MessageGenerationStopped`, `EphemeralMessageParameters`, `DisabledButton`, `RichBlockButtons`. В `Context` есть `replyWithDraft`, `replyWithRichMessage`, `replyWithRichMessageDraft`, хелперы `Ephemeral*`, фильтры `guest_message` и `stopped_message_generation`. **grammY отслеживает Bot API 10.3 — актуальную версию.**

---

# 2. Хронология Bot API за ~24 месяца (7.10 → 10.3)

Источник: [changelog](https://core.telegram.org/bots/api-changelog). Только то, что важно для нас; полный список — по ссылке.

| Версия | Дата | Главное |
|---|---|---|
| **10.3** | 2026-08-24 | Rich: `RichMessageButton`/`RichTextButton`, `RichBlockButtons`, таблицы `is_compact`, `RichBlockExpandableBlockQuotation`, `RichBlockDocument`. Ephemeral: `EphemeralMessageParameters` (вместо `receiver_user_id`/`callback_query_id`), `replace_callback_query_message`, `editEphemeralMessage*` дополнены. Разметка: `DisabledButton` (+ `InlineKeyboardButton.disabled`), `force_reply` в `InlineKeyboardMarkup` и `ReplyKeyboardMarkup`. `sendMessageDraft`/`sendRichMessageDraft`: `can_stop`, `keep_on_stop`; апдейт `stopped_message_generation`. `community_chat_joined`. Секретарские боты без Premium, сообщения боту по username при включённом bot-to-bot, пустой `text` в `sendMessageDraft`, `getUserPersonalChatMessages`, `getManagedBotAccessSettings` / `setManagedBotAccessSettings`. |
| **10.2** | 2026-07-14 | Ephemeral Messages (методы `editEphemeralMessage*`, `deleteEphemeralMessage`, `BotCommand.is_ephemeral`, `Message.receiver_user`, `ephemeral_message_id`). Communities (`Community`, сервисные сообщения). Rich: `InputRichBlock*` (явные блоки), `InputMediaVoiceNote`, `InputRichMessageMedia`. Апдейт `subscription`. **Защита Mini App от вызова методов с чужих origin (автоматически с 2026-07-20).** |
| **10.1** | 2026-06-11 | **Rich Messages** (`sendRichMessage`, `sendRichMessageDraft`, `rich_message` в `editMessageText`, `InputRichMessageContent`). Join Request Queries (`answerChatJoinRequestQuery`, `sendChatJoinRequestWebApp`). Ссылки в опросах (`Link`). |
| **10.0** | 2026-05-08 | **Guest Mode** (`guest_message`, `answerGuestQuery`, `supports_guest_queries`). `deleteMessageReaction`, `deleteAllMessageReactions`, `can_react_to_messages`. Боты могут видеть часть сообщений других ботов в группах. Опросы: медиа, `members_only`, `country_codes`, минимум 1 вариант. Live photos (`sendLivePhoto`). Bot-to-bot по username. `sendMessageDraft`: пустой текст. |
| **9.6** | 2026-04-03 | **Managed Bots** (`getManagedBotToken`, `replaceManagedBotToken`, `KeyboardButtonRequestManagedBot`, ссылки `t.me/newbot/...`). `savePreparedKeyboardButton`, `WebApp.requestChat`. Опросы: викторины с несколькими правильными ответами (`correct_option_ids`), `allows_revoting`, `shuffle_options`, описание. `date_time` разрешён в checklist, `TextQuote`, `ReplyParameters.quote`. |
| **9.5** | 2026-03-01 | **`MessageEntity` `date_time`.** `sendMessageDraft` доступен **всем** ботам. Теги участников (`setChatMemberTag`, `sender_tag`). `BottomButton.iconCustomEmojiId` (Mini App). |
| **9.4** | 2026-02-09 | Custom emoji в сообщениях бота, если владелец бота — Premium. **`createForumTopic` в приватных чатах.** `icon_custom_emoji_id` и **`style`** у `KeyboardButton`/`InlineKeyboardButton`. `setMyProfilePhoto` / `removeMyProfilePhoto`. |
| **9.3** | 2025-12-31 | **Темы в приватных чатах** (`has_topics_enabled`, `message_thread_id` в приватных чатах). **`sendMessageDraft`** (до 9.5 — не для всех ботов). Подарки (`getUserGifts`, `getChatGifts`), `repostStory`, рейтинг пользователей. |
| **9.2** | 2025-08-15 | `checklist_task_id` в `ReplyParameters`, direct messages в каналах, Suggested Posts. |
| **9.1** | 2025-07-03 | **Checklists** (`Checklist`, `sendChecklist`, `editMessageChecklist` — только от имени business-аккаунта). До 12 вариантов в опросах. `WebApp.hideKeyboard`. |
| **9.0** | 2025-04-11 | Business: права `BusinessBotRights`, `readBusinessMessage`, `deleteBusinessMessages`, управление профилем/подарками/историями. **Mini Apps: `DeviceStorage`, `SecureStorage`.** Подарки, Premium-подарки. |
| **8.3** | 2025-02-12 | Подарки в каналы, `cover`/`start_timestamp` у видео, реакции на большинство сервисных сообщений. |
| **8.2** | 2025-01-01 | Верификации (`verifyUser`/`verifyChat`), `hide_url` убран из `InlineQueryResultArticle` (передавать пустой `url`). |
| **8.1** | 2024-12-04 | Расширение Stars-транзакций, партнёрская программа. |
| **8.0** | 2024-11-17 | **Mini Apps**: fullscreen, `safeAreaInset`/`contentSafeAreaInset`, `addToHomeScreen`, `lockOrientation`, `LocationManager`, `Accelerometer`/`Gyroscope`/`DeviceOrientation`, `shareMessage` + **`savePreparedInlineMessage`**, `downloadFile`, эмодзи-статус, кастомный loading screen, **валидация `initData` для третьих сторон (Ed25519 `signature`)**. Stars-подписки, подарки. |
| **7.11** | 2024-10-31 | **`copy_text` кнопка**, **`allow_paid_broadcast`**, `editMessageMedia` для текстовых сообщений, hashtag/cashtag с указанием чата. |
| **7.10** | 2024-09-06 | `SecondaryButton` в Mini App, `setBottomBarColor`, `bottom_bar_bg_color`, `purchased_paid_media`. |

Более ранние, но базовые для нас версии (в окно 24 месяцев не входят, но на них строится дизайн): 7.8 (2024-07-31) — main Mini App, `shareToStory`; 7.6 — paid media; 7.5 — business-редактирование; 7.4 (2024-05-28) — `message_effect_id`, `show_caption_above_media`, `expandable_blockquote`, Stars `XTR`; 7.3 — `InputPollOption`; 7.2 (2024-03-31) — Business-аккаунты, `BiometricManager`; 7.0 (2023-12-29) — реакции, `ReplyParameters`/`external_reply`/`quote`, `LinkPreviewOptions`, `blockquote`, `deleteMessages`/`forwardMessages`/`copyMessages`, `forward_origin`, `SettingsButton`; 6.9 — `CloudStorage`, `requestWriteAccess`; 6.7 — `switch_inline_query_chosen_chat`, `InlineQueryResultsButton`, локализованные `setMyName`; 6.6 — локализованные описания; 6.5 — `request_users` / `request_chat`.

---

# 3. Проверка списка «что существует» (из запроса)

| Заявленная возможность | Существует? | Версия / комментарий |
|---|---|---|
| Message draft streaming | **Да** | `sendMessageDraft` 9.3 (все боты с 9.5); `sendRichMessageDraft` 10.1; стоп-кнопка 10.3. Только приватные чаты. |
| Checklists | **Да, с оговоркой** | 9.1. `sendChecklist`/`editMessageChecklist` **только от имени business-аккаунта** (`business_connection_id` обязателен). Обычный бот отправить checklist в личку не может. Получать `Message.checklist` — можно. |
| Gifts | Да | 8.0+ (`sendGift`, `getAvailableGifts`); для продукта не нужны. |
| Business features | Да | 7.2+, права `BusinessBotRights`. |
| Managed bots | Да | 9.6; управление доступом 10.3. |
| Topics in private chats | Да | 9.3 (`message_thread_id` в личке), 9.4 (`createForumTopic`); включается в BotFather. |
| Reactions | Да | 7.0 `setMessageReaction`; боту доступна **одна** реакция из 73 стандартных эмодзи; платные реакции для ботов запрещены. |
| Message effects | Да | 7.4 `message_effect_id` (только приватные чаты). **Список ID в документации не найден.** |
| Paid media | Да | 7.6. |
| Colored/styled buttons | Да | 9.4 `style`: `danger` (красный), `success` (зелёный), `primary` (синий); `link` — только в `RichMessageButton`. |
| `copy_text` buttons | Да | 7.11, 1–256 символов. |
| Prepared inline messages | Да | 8.0 `savePreparedInlineMessage` + `WebApp.shareMessage`. |
| Request users/chat | Да | 6.5; множественный выбор 7.0. |
| Story sharing | Да | Mini App `WebApp.shareToStory` (7.8); у бота — `postStory` только для business. |
| Formatted dates | **Да** | `date_time` entity (9.5), `tg://time?unix=..&format=..`. |
| `has_mention` | **Нет** | Поля `has_mention` в Bot API нет. Использовать `entities`. |
| Список message effect ID | **Не найден** | Документация не содержит идентификаторов. |
| Часовой пояс пользователя | **Нет** | Только `language_code`. |
| Нативная транскрипция голосовых | **Нет в Bot API** | В документации не найдена. |
| Отложенная отправка (`schedule_date`) | **Нет** | Только автоматическое планирование сервером видео для больших чатов (см. `message_id = 0`). |
| Admin-параметр в `startgroup`-ссылке | **Не найден** | В `features`/`api` не описан; есть `setMyDefaultAdministratorRights`. |

---

# 4. Сценарии продукта: что использовать

## 4.1 Сценарий A — личная задача → 1–3 слота кнопками

**Факт.**
- Inline-клавиатура: [`InlineKeyboardMarkup`](https://core.telegram.org/bots/api#inlinekeyboardmarkup) + [`InlineKeyboardButton`](https://core.telegram.org/bots/api#inlinekeyboardbutton). У кнопки ровно одно «действие» из: `url`, `callback_data` (1–64 **байта**), `web_app`, `login_url`, `switch_inline_query*`, `copy_text`, `callback_game`, `pay`, `disabled`.
- `style`: `danger` / `success` / `primary` (9.4). `icon_custom_emoji_id` — только у ботов с дополнительными username на Fragment или если владелец бота Premium (и только в сообщениях, отправленных ботом в личку/группы).
- `DisabledButton` (10.3) — неактивная кнопка. `force_reply` в `InlineKeyboardMarkup` (10.3) открывает интерфейс ответа (значение нельзя менять при редактировании клавиатуры).
- После нажатия callback-кнопки клиент показывает индикатор, пока бот не вызовет [`answerCallbackQuery`](https://core.telegram.org/bots/api#answercallbackquery) («необходимо ответить, даже если уведомление не нужно»). `text` 0–200 символов, `show_alert`, `cache_time`.
- Изменение сообщения: [`editMessageText`](https://core.telegram.org/bots/api#editmessagetext) / `editMessageReplyMarkup`. «Пока можно редактировать только сообщения без `reply_markup` или с inline-клавиатурой».
- В `CallbackQuery.data`: «сообщение, породившее запрос, может не содержать кнопок с такими данными» — данные нельзя считать доказательством.

**Рекомендованная механика (Предположение команды).**
> Предположение команды: три слота — три `callback_data` вида `s1:<id-предложения>:<номер-слота>` (короткий id, состояние хранится на сервере, лимит 64 байта). Кнопки: слот-кнопки (по одной на слот, `primary`), затем ряд [Другое время] (`web_app` мини-приложение выбора времени либо callback → короткий диалог) и [Изменить]. Подтверждающую кнопку [Поставить] можно красить `success`, отмену — `danger`. После нажатия — `editMessageText` (итог) и `editMessageReplyMarkup` с `DisabledButton` («Поставлено ✓») для защиты от двойного нажатия. Время слота показывать через `date_time` entity (см. раздел 5.1), чтобы оно отображалось в локальной зоне читателя; для событий в чужой зоне — дополнительно писать зону текстом.

| Элемент | Версия | Вердикт |
|---|---|---|
| Inline-клавиатура + `callback_data` + `answerCallbackQuery` | базовое | **USE NOW** |
| `style` кнопок | 9.4 | **USE NOW** (нативные цвета вместо эмодзи) |
| `DisabledButton` после действия | 10.3 | **USE NOW** (проверить рендер на клиентах) |
| `web_app` в inline-кнопке [Другое время] | 6.0 | **USE LATER** (v1: callback; мини-выбор времени в Mini App — во второй итерации) |
| `copy_text` (ссылка на встречу, ICS-текст) | 7.11 | **USE LATER** |
| `icon_custom_emoji_id` | 9.4 | **DON'T USE** (зависит от Premium владельца бота; хрупко) |
| `pay`, `callback_game`, `login_url` | старое | **DON'T USE** |
| `force_reply` в inline-разметке | 10.3 | **USE LATER** (можно для «Другое время: напишите ответом») |

## 4.2 Сценарий B — пересланное сообщение → классификация намерения

**Факт.** [`Message.forward_origin`](https://core.telegram.org/bots/api#messageorigin) (7.0) — один из четырёх типов:

| Тип | Поля | Нюанс |
|---|---|---|
| `MessageOriginUser` | `sender_user`, `date` | Пользователь известен |
| `MessageOriginHiddenUser` | `sender_user_name`, `date` | Пользователь скрыл пересылки: **только имя, id нет** |
| `MessageOriginChat` | `sender_chat`, `author_signature?` | Отправлено от имени чата |
| `MessageOriginChannel` | `chat`, `message_id`, `author_signature?` | Пост канала |

- `date` в origin — время исходного отправления, а не пересылки.
- Дополнительно: `is_automatic_forward`, `has_protected_content` (пересылка запрещена), `media_group_id` (альбомы), `text`+`entities`, `caption`+`caption_entities`, во входящих текстах могут приходить `date_time` entity с `unix_time`.
- Входящие типы, которые полезно классифицировать: `text`, `photo`, `voice`, `video_note`, `document`, `contact`, `location`, `venue`, `poll`, `checklist` (пересланный список дел), `live_photo`.

> Предположение команды: для скрытых отправителей не пытаться восстановить личность (id недоступен по определению); хранить строку `sender_user_name` как «подпись источника» и спрашивать пользователя. Пересланный альбом приходит **отдельными апдейтами** с общим `media_group_id` — их надо агрегировать с коротким окном ожидания (документация про порядок и задержки молчит). Уже присланное `date_time` entity из чужого сообщения — готовое точное время, использовать приоритетно перед NLP-разбором. `Message.checklist` из пересланного сообщения — прямой источник списка задач.

| Элемент | Вердикт |
|---|---|
| `forward_origin` разбор всех четырёх типов | **USE NOW** |
| Агрегация `media_group_id` | **USE NOW** (для скриншотов/альбомов) |
| Чтение входящих `date_time` entity | **USE NOW** |
| `Message.checklist` / `poll` как источник задач | **USE LATER** |
| `copyMessage`/`forwardMessage` для архива | **DON'T USE** (храним свои копии; копия не связана с оригиналом) |

## 4.3 Сценарий C — группа: тишина, пока не reply или @mention

**Факт: доставка сообщений** ([features: privacy mode](https://core.telegram.org/bots/features#privacy-mode), [FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get)):
- Всегда, независимо от режима: все сервисные сообщения, все сообщения из приватных чатов, все сообщения каналов, где бот — участник.
- **Privacy mode включён (по умолчанию):** команды, адресованные боту (`/cmd@this_bot`); «общие» команды (`/start`), если бот последним писал в группе; сообщения, отправленные «через бота»; **reply на сообщения, явно или неявно адресованные боту**. Одно сообщение доступно только одному privacy-боту, приоритет у reply.
- **Privacy mode выключен или бот — админ:** все сообщения, кроме сообщений других ботов. После смены настройки бота нужно **заново добавить в группу**.
- Явного упоминания «текст с @bot» в перечне privacy mode **нет**.
- Обычные боты не видят сообщения других ботов; исключение — bot-to-bot режим (10.0) в BotFather.

**Факт: как распознать адресацию** ([`MessageEntity`](https://core.telegram.org/bots/api#messageentity)):
- `mention` (`@username`), `text_mention` (пользователи без username), `bot_command` (`/start@jobs_bot`); `offset`/`length` в **UTF-16 code units**.
- `reply_to_message` — для ответов в том же чате и треде (без вложенных `reply_to_message`); `external_reply` (7.0) — ответ из другого чата/темы; `quote` (`TextQuote`) — процитированный фрагмент, `is_manual` показывает, выбран ли вручную; `via_bot`; `message_thread_id` + `is_topic_message` для тем в супергруппах и приватных чатах; `sender_chat` для анонимных админов.
- `getMe` возвращает `can_read_all_group_messages` (true, если privacy mode выключен) и `can_join_groups`.

**Факт: официальные механизмы «позвать бота без шума»:**
- **Guest Mode** (10.0): включается в BotFather Mini App; при @mention или reply на сообщение гостевого бота он получает апдейт `guest_message` (с `guest_query_id`, контекстом и сообщением, на которое ответили) и **один ответ** через [`answerGuestQuery`](https://core.telegram.org/bots/api#answerguestquery). Нет доступа к истории и составу участников, будущих апдейтов не будет, можно упомянуть до 3 гостевых ботов. Результат — `InlineQueryResult`, допустим `InputRichMessageContent`. ([features: guest bots](https://core.telegram.org/bots/features#guest-bots))
- **Ephemeral** (раздел 5.8): бот-админ может слать приватное сообщение любому участнику в любое время; обычный бот — в течение 15 секунд после callback-нажатия.
- **ForceReply** (`selective`): «обходит» privacy mode, так как ответы на сообщение бота доставляются всегда.
- Команды: `setMyCommands` со `scope=all_group_chats` / `chat` / `chat_administrators` / `chat_member` (+ `language_code`); в апдейтах нет информации о scope — «бэкенд обязан сам проверять допустимость команды и права».

> Предположение команды: рабочая схема для группы — privacy mode оставить **включённым**; активировать бота тремя путями: (1) `/cmd@bot`, (2) reply на сообщение бота, (3) @mention с проверкой по `entities` (тип `mention`, текст равен `@<getMe.username>` без учёта регистра, либо `text_mention.user.id == bot.id`). Тихий режим реализовать так: любое сообщение без этих признаков просто не приходит (privacy) или отбрасывается фильтром. Guest Mode — кандидат на «призвать агента из любого чата без добавления»; для планировщика полезен как «@агент найди слот на этой неделе» в чужом чате, но нужно проверить, что guest-ответ (одна реплика) достаточно для нашего UX.

| Элемент | Вердикт |
|---|---|
| Privacy mode (оставить включённым) | **USE NOW** |
| Распознавание mention/reply/command по entities | **USE NOW** |
| `message_thread_id` — ответ в тот же тред | **USE NOW** |
| `external_reply` / `quote` как контекст задачи | **USE LATER** |
| Команды со scope `all_group_chats` (минимальный набор) | **USE NOW** |
| Ephemeral сообщения в группах | **USE LATER** (первая версия — только DM) |
| Guest Mode | **USE LATER** (исследовать после запуска DM) |
| Отключение privacy mode | **DON'T USE** (лишние данные, риск приватности) |

## 4.4 Сценарий D — inline-режим

**Факт** ([Inline Bots](https://core.telegram.org/bots/inline), [API: inline mode](https://core.telegram.org/bots/api#inline-mode)):
- Включается `/setinline` в BotFather; фидбэк по выбранным результатам — `/setinlinefeedback` (без него нет `chosen_inline_result`); геолокация — `/setinlinegeo`.
- [`InlineQuery`](https://core.telegram.org/bots/api#inlinequery): `id`, `from`, `query` (**до 256 символов**), `offset`, `chat_type` (`sender` — личка отправителя, `private`, `group`, `supergroup`, `channel`; неизвестен в секретных чатах), `location?`.
- [`answerInlineQuery`](https://core.telegram.org/bots/api#answerinlinequery): **до 50 результатов**; `cache_time` по умолчанию **300 сек** (кэш на сервере); `is_personal` — кэшировать только для запросившего (по умолчанию результаты могут быть отданы любому, кто отправит тот же запрос); `next_offset` (**до 64 байт**); `button` ([`InlineQueryResultsButton`](https://core.telegram.org/bots/api#inlinequeryresultsbutton)) — `web_app` либо `start_parameter` (1–64 символа `A-Za-z0-9_-`) для перехода в личку с ботом (привязка аккаунта).
- Результаты: 20 типов; `id` результата 1–64 байт. Контент отправляемого сообщения: `InputTextMessageContent`, **`InputRichMessageContent`** (10.1, «только ранее загруженные файлы»), `InputLocation…`, `InputVenue…`, `InputContact…`, `InputInvoice…`. «Все URL в результатах публичны».
- `ChosenInlineResult.inline_message_id` — только если к сообщению прикреплена inline-клавиатура; позволяет редактировать такое сообщение через `editMessageText` с `inline_message_id`. При редактировании inline-сообщений нельзя загружать новые файлы (только `file_id` или URL).
- Сообщения, отправленные через бота, подписаны «via @bot» (`Message.via_bot`); privacy-ботам такие сообщения доставляются (FAQ).
- Prepared messages: [`savePreparedInlineMessage`](https://core.telegram.org/bots/api#savepreparedinlinemessage) (`user_id`, `result`, флаги `allow_user_chats` / `allow_bot_chats` / `allow_group_chats` / `allow_channel_chats`) → `PreparedInlineMessage {id, expiration_date}`; в Mini App — `WebApp.shareMessage(id)`. Просроченное использовать нельзя.
- Кнопки `switch_inline_query`, `switch_inline_query_current_chat`, `switch_inline_query_chosen_chat` — переход в inline-режим, в т. ч. из inline-клавиатуры и Mini App (`WebApp.switchInlineQuery`).

> Предположение команды: inline для нас — это «поделиться свободными слотами с собеседником» (в чужом чате). Данные календаря приватны, поэтому **всегда** `is_personal: true`, короткий `cache_time` (0–30 сек), результаты содержат только то, что пользователь явно разрешил показать (например, три свободных окна без названий встреч). Первичный вход — `button` со `start_parameter` для привязки аккаунта, если пользователь ещё не авторизован. Это отдельная итерация после DM и Mini App.

| Элемент | Вердикт |
|---|---|
| `inline_query` + `answerInlineQuery` («поделись слотами») | **USE LATER** |
| `is_personal` / `cache_time` | **USE LATER** (обязательны при включении inline) |
| `button` со `start_parameter` / `web_app` | **USE LATER** |
| `chosen_inline_result` | **USE LATER** (для аналитики) |
| `savePreparedInlineMessage` + `shareMessage` («отправить предложение времени из Mini App») | **USE LATER** |
| `InputRichMessageContent` в inline-результатах | **DON'T USE** пока (сначала проверить в личных сообщениях) |

## 4.5 Сценарий E — PERSONAL против CHAT контекст

**Факт.** Контекст задаётся полями `Chat.type` (`private`/`group`/`supergroup`/`channel`), `Chat.id`, `Message.message_thread_id` (темы), `business_connection_id` (чат business-аккаунта независим от чата с ботом), `guest_query_id` (чат, где позвали гостевого бота, может не совпадать с существующими чатами бота), `InlineQuery.chat_type`, `WebAppInitData.chat_type`/`chat_instance` (для direct-link Mini App). `Chat.id` может быть >32 бит (до 52 значащих бит).

> Предположение команды: ключ контекста — `(chat.id, message_thread_id ?? 0, business_connection_id ?? none, тип источника)`; личные данные (календарь, задачи) выдаются **только** при `chat.type == "private"` и при совпадении `from.id` с владельцем. В группе — только данные самой группы/треда и явно расшаренное; любые «личные детали» переносим в DM через глубокую ссылку `t.me/<bot>?start=<токен>` либо через ephemeral. Миграция группы → супергруппа даёт ошибку с `parameters.migrate_to_chat_id` (документировано) — обновлять ключи.

Отдельно: **Telegram Login (OIDC)** для веб-приложения ([документация](https://core.telegram.org/bots/telegram-login)) — Authorization Code Flow с PKCE, discovery `https://oauth.telegram.org/.well-known/openid-configuration`, scopes `openid`, `profile`, `phone`, `telegram:bot_access` (разрешение боту писать в личку). Позволяет связать веб-аккаунт и Telegram без пароля и одновременно получить право писать пользователю. **USE LATER** (для веб-онбординга).

## 4.6 Сценарий F — Mini App: подробно в разделе 6.

## 4.7 Сценарий G — напоминания и check-in «Как прошло?»

**Факт.**
- Отложенной отправки в Bot API нет; планирование целиком на нашей стороне. Единственное «автопланирование» — сервер может отложить отправку видео в большие чаты (тогда `message_id = 0`).
- Бот пишет пользователю, только если пользователь начал с ним диалог; при блокировке бота в приватном чате приходит `my_chat_member` (только в этом случае, для приватных чатов).
- `disable_notification` («тихая» отправка), `message_effect_id` (только приватные чаты), `protect_content`.
- Лимиты: ~1 сообщение/сек на чат, 20 сообщений/мин в группе, ~30 сообщений/сек в рассылке ([FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)). `retry_after` в `ResponseParameters`.
- `sendChatAction` — на 5 секунд или меньше; сбрасывается, когда приходит сообщение бота.

> Предположение команды: напоминание = обычное сообщение с inline-клавиатурой [Готово] / [Отложить] / [Не успел]; check-in после блока — «Как прошло?» с кнопками (`success` — «Готово», `danger` — «Не вышло», нейтральная — «Перенести»). Все кнопки идемпотентны: повторное нажатие после обработки → `answerCallbackQuery` с текстом «Уже учтено». Нужен собственный планировщик с устойчивой очередью и учётом лимита 1 msg/сек на чат. Часовой пояс пользователя Bot API не даёт (в `User` его нет, только `language_code`) — брать из онбординга или из Mini App (JS `Intl`, вне документации Telegram).

| Элемент | Вердикт |
|---|---|
| Сообщение + inline-кнопки [Готово]/[Отложить] | **USE NOW** |
| `message_effect_id` для «праздничных» итогов | **USE LATER** (списка ID в документации нет) |
| `setMessageReaction` как «принято» (👍/✍/👌 и т. п.) | **USE NOW** (дешёвый ack, без сообщения) |
| `sendChatAction` typing/record_voice | **USE NOW** |
| Native poll как check-in | **DON'T USE** |
| Checklist как задача-лист | **DON'T USE** (только business) |
| Отслеживание блокировки: `my_chat_member` | **USE NOW** |

## 4.8 Сценарий H — голосовые → распознавание речи

**Факт.**
- Входящий [`Voice`](https://core.telegram.org/bots/api#voice): `file_id`, `file_unique_id`, `duration`, `mime_type?`, `file_size?`.
- [`getFile`](https://core.telegram.org/bots/api#getfile): «боты могут скачивать файлы до **20 МБ**»; ссылка `https://api.telegram.org/file/bot<token>/<file_path>` действует **минимум 1 час**; имя и MIME-тип могут не сохраниться — их надо сохранять при получении объекта.
- Локальный Bot API server ([Using a Local Bot API Server](https://core.telegram.org/bots/api#using-a-local-bot-api-server)): скачивание без ограничения размера, загрузка до **2000 МБ**, `file_path` приходит как абсолютный локальный путь, webhook на HTTP и любой порт, `max_connections` до 100000.
- Отправка голосовых ботом: `sendVoice` — OGG/OPUS, MP3 или M4A, до 50 МБ; при отправке по URL: `audio/ogg`, до 1 МБ; 1–20 МБ отправляются как файл.
- `sendChatAction`: `record_voice` / `upload_voice`.
- Документация Bot API **не содержит** встроенной транскрипции голосовых.

> Предположение команды: голосовое → проверить `file_size` до `getFile` (лимит 20 МБ достаточно для сообщений в несколько часов OGG/Opus, реально упираемся в длительность модели STT) → скачать → STT → показать распознанный текст пользователю для подтверждения перед созданием задачи. Формат Voice в документации не назван; на практике клиенты кодируют голос в OGG/Opus — **нужно проверить по `mime_type`** и не полагаться на предположение. Локальный Bot API server для голосовых **не нужен**; нужен только для файлов >20 МБ (`document`), если такие сценарии появятся.

| Элемент | Вердикт |
|---|---|
| `voice` → `getFile` → STT | **USE NOW** |
| `sendChatAction` `record_voice`/`typing` во время STT | **USE NOW** |
| Локальный Bot API server | **DON'T USE** (пока) |
| `video_note` (кружки) как источник речи | **USE LATER** |
| Отправка голосовых ботом (`sendVoice`) | **DON'T USE** |

## 4.9 Сценарий I — стриминг ответа LLM

**Факт: [`sendMessageDraft`](https://core.telegram.org/bots/api#sendmessagedraft)** (9.3; всем ботам с 9.5):

| Параметр | Значение |
|---|---|
| `chat_id` | только **приватный** чат |
| `draft_id` | ненулевой; изменения с тем же id **анимируются**, другой id заменяет без анимации |
| `text` | 0–4096 символов после парсинга; **пустой текст показывает «Thinking…»** (10.0/10.3) |
| `parse_mode` / `entities` | как в `sendMessage` |
| `can_stop`, `keep_on_stop` | кнопка «Стоп» (10.3); при нажатии приходит апдейт `stopped_message_generation` (`chat`, `message_thread_id?`, `draft_id`); `keep_on_stop` оставляет черновик |
| Срок жизни | «временное 30-секундное превью»; чтобы сообщение осталось, вызывается `sendMessage` с итогом |

- Аналог для rich: `sendRichMessageDraft` (тег `<tg-thinking>` / `InputRichBlockThinking` — визуальный плейсхолдер; «не транскрипт рассуждений модели»). Прямая загрузка файлов и URL-файлы не поддерживаются в черновике.
- В `features`: «в приватных чатах бот может показывать черновик, пока идёт генерация».
- Fallback на редактирование: `sendMessage` + повторные `editMessageText` (лимит частоты редактирования в документации не указан; общий ориентир FAQ — ~1 сообщение/сек на чат; ошибка «message is not modified» не описана).

> Предположение команды: основная стратегия — `sendMessageDraft` с фиксированным `draft_id` на ответ; троттлинг обновлений ≥ 300–500 мс (конкретный лимит частоты для draft в документации **не указан**, проверить на реальном боте); в группах и там, где draft недоступен (`chat.type != private`), — edit-based fallback с обновлением не чаще раза в секунду и итоговым `editMessageText`. Финал всегда отправляется через `sendMessage`/`sendRichMessage` (иначе через 30 секунд пропадёт). `can_stop` включать по умолчанию и по `stopped_message_generation` отменять запрос к LLM.

| Элемент | Вердикт |
|---|---|
| `sendMessageDraft` + финальный `sendMessage` | **USE NOW** |
| `can_stop` + `stopped_message_generation` | **USE NOW** |
| `sendRichMessageDraft` | **USE LATER** (после подтверждения клиентской поддержки) |
| Edit-based fallback | **USE NOW** (для групп) |

---

# 5. RICH MESSAGES: форматирование и богатые сообщения

## 5.1 Форматирование обычных сообщений

**Факт** ([Formatting options](https://core.telegram.org/bots/api#formatting-options)):

| Режим | Замечания |
|---|---|
| `HTML` | Теги `<b>/<strong>`, `<i>/<em>`, `<u>/<ins>`, `<s>/<strike>/<del>`, `<tg-spoiler>`/`<span class="tg-spoiler">`, `<a href>`, `<tg-emoji emoji-id>`, `<tg-time unix format>`, `<code>`, `<pre>` (+ `<code class="language-x">`), `<blockquote>` и `<blockquote expandable>`. `<`, `>`, `&` экранировать (`&lt;` `&gt;` `&amp;` `&quot;`); поддерживаются только 4 именованные сущности и все числовые. |
| `MarkdownV2` | `*bold*`, `_italic_`, `__underline__`, `~strike~`, `\|\|spoiler\|\|`, ссылки, `![](tg://emoji?id=..)`, `![текст](tg://time?unix=..&format=..)`, цитаты `>` и раскрываемые `**>` … `\|\|`. Экранировать `\` перед `_ * [ ] ( ) ~ \` > # + - = \| { } . !`. Есть неоднозначность `italic`/`underline` (`___`). |
| `Markdown` (legacy) | Только совместимость; нельзя вкладывать entity; нет underline/strikethrough/spoiler/blockquote/custom_emoji/date_time. |
| `entities` | Явный массив [`MessageEntity`](https://core.telegram.org/bots/api#messageentity) вместо `parse_mode`; `offset`/`length` в **UTF-16**. |

**Все типы entity:** `mention`, `hashtag`, `cashtag`, `bot_command`, `url`, `email`, `phone_number`, `bold`, `italic`, `underline`, `strikethrough`, `spoiler`, `blockquote`, `expandable_blockquote`, `code`, `pre` (+`language`), `text_link` (+`url`), `text_mention` (+`user`), `custom_emoji` (+`custom_emoji_id`), `date_time` (+`unix_time`, `date_time_format`).

**Вложенность:** если у двух entity общие символы, одна должна целиком содержать другую; `bold/italic/underline/strikethrough/spoiler` можно вкладывать во всё, кроме `pre`/`code`; `blockquote` и `expandable_blockquote` не вкладываются; остальные не вкладываются друг в друга.

**`date_time`** ([Date-time entity formatting](https://core.telegram.org/bots/api#date-time-entity-formatting), введено 9.5): формат-строка по шаблону `r|w?[dD]?[tT]?`. `r` — относительное время (нельзя сочетать с другими), `w` — день недели, `d` короткая дата, `D` длинная, `t` короткое время, `T` длинное. Пустая строка — исходный текст, но пользователь может получить дату в локальном формате. Разрешено также в checklist, `TextQuote`, `ReplyParameters.quote`, подарках.

**Прочее:**
- Текст сообщения — **1–4096** символов **после парсинга entity**; подпись — **0–1024**.
- Ссылка `tg://user?id=` работает только внутри inline-ссылки или кнопки; вне чата гарантированно только для пользователей, писавших боту или нажимавших callback, без включённой «Forwarded Messages» приватности.
- Custom emoji: только боты с доп. username на Fragment либо в сообщениях, отправленных ботом в личку/группы, если владелец бота Premium (9.4).
- Перед открытием inline-ссылки клиент показывает предупреждение «Open this link?».

**`LinkPreviewOptions`** (7.0): `is_disabled`, `url` (принудительно выбрать URL превью), `prefer_small_media`, `prefer_large_media` (только при явно заданном `url`), `show_above_text`. Заменяют `disable_web_page_preview`.

> Предположение команды: базовый формат — **HTML** (проще экранировать, чем MarkdownV2; entity `<tg-time>` для слотов). Слоты: `<tg-time unix="…" format="wDt">пт 15:00</tg-time>` — в тексте-запасе указывать человекочитаемый вариант в зоне пользователя, потому что старые клиенты его покажут вместо форматированной даты (поведение старых клиентов в документации не описано — проверить). Ссылки-предпросмотры в напоминаниях отключать (`is_disabled: true`), чтобы не раздувать сообщение.

| Элемент | Вердикт |
|---|---|
| `parse_mode: HTML` | **USE NOW** |
| `MarkdownV2` | **DON'T USE** (хрупкое экранирование, вместо него — HTML или Rich Markdown) |
| `entities` массивом (генерация из структуры, а не строки) | **USE LATER** |
| `blockquote`/`expandable_blockquote` для длинных деталей | **USE NOW** |
| `spoiler` (скрыть приватные детали в групповых превью) | **USE LATER** |
| `custom_emoji` | **DON'T USE** |
| `date_time` (`tg-time`) | **USE NOW** |
| `link_preview_options` | **USE NOW** |

## 5.2 Rich Messages (Bot API 10.1+)

**Факт** ([Rich messages](https://core.telegram.org/bots/api#rich-messages), [features](https://core.telegram.org/bots/features#rich-messages)):

- Метод [`sendRichMessage`](https://core.telegram.org/bots/api#sendrichmessage): параметр `rich_message` — [`InputRichMessage`](https://core.telegram.org/bots/api#inputrichmessage), где **ровно одно** из `html`, `markdown`, `blocks`; плюс `media`, `is_rtl`, `skip_entity_detection`. Остальные параметры как у `sendMessage`: `chat_id`, `message_thread_id`, `disable_notification`, `protect_content`, `allow_paid_broadcast`, `message_effect_id`, `reply_parameters`, `reply_markup`, `business_connection_id`, `ephemeral_message_parameters`.
- Лимиты: **32768** UTF-8 символов; **500** блоков (включая вложенные); **16** уровней вложенности; **50** медиа; **20** колонок таблицы.
- Автоопределение entity: URL, e-mail, `@username`, хэштеги, cashtag, команды бота, телефоны, номера карт; отключается `skip_entity_detection`.
- **Rich Markdown** (совместим с GFM): `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `==marked==`, `||spoiler||`, ссылки (`mailto:`, `tel:`, `tg://user?id=`), `![](tg://emoji?id=..)`, `![текст](tg://time?unix=..&format=..)`, формулы `$x^2$` и `$$..$$`/`` ```math ``, заголовки `#`…`######`, списки (в т. ч. task-list `- [ ]` / `- [x]`), цитаты, таблицы с выравниванием, сноски `[^id]`, разделитель `---`, блоки кода, `<details><summary>`, `<tg-collage>`, `<tg-slideshow>`; медиа-блоки `![](url "подпись")` (только http/https, только отдельным блоком; тип определяется по MIME и URL).
- **Rich HTML**: дополнительно `<sub>`, `<sup>`, `<mark>`, `<a name>` / `<a href="#..">` (якоря), `<tg-reference>` (сноски), `<aside>` (pull-quote), `<footer>`, `<hr/>`, `<ol start type reversed>`, `<table bordered striped compact>` с `colspan`/`rowspan`/`align`/`valign`, `<tg-map lat long zoom/>`, `<figure>/<figcaption>/<cite>`, `<tg-document>`, `<tg-math>`, `<tg-math-block>`. Именованные HTML-сущности расширены (`&nbsp;`, `&hellip;`, `&mdash;`, …).
- **Кнопки внутри rich-сообщения:** `<tg-button type="url|callback_data|web_app|login_url|switch_inline_query|switch_inline_query_current_chat|switch_inline_query_chosen_chat|copy_text|disabled" style="primary|success|danger|link">`, ряды `<tg-button-row align="left|center|right">`. Стиль `link` (кнопка-ссылка без рамки) допустим только для callback-кнопок. `callback_data` — 1–64 байта. Эквивалентный тип — [`RichMessageButton`](https://core.telegram.org/bots/api#richmessagebutton).
- Ограничения: «Markdown не разбирается внутри блочных HTML-тегов, кроме `<details>`, `<tg-collage>`, `<tg-slideshow>`»; ячейки таблицы — только inline-форматирование; формулы — сырой LaTeX.
- Редактирование: параметр `rich_message` в [`editMessageText`](https://core.telegram.org/bots/api#editmessagetext) (для inline-сообщений нельзя загружать новые файлы). `editMessageMedia` может заменить rich-сообщение медиа.
- Inline/guest/Web App результаты: `InputRichMessageContent` (только ранее загруженные файлы).
- Получение: `Message.rich_message` (`RichMessage.blocks`, `is_rtl`).
- `sendRichMessageDraft` — стриминг rich-черновика (30 секунд; `<tg-thinking>` доступен только в нём).
- Демо-бот из документации: @RichTextDemoBot.

> Предположение команды: Rich Markdown — прямой приёмник Markdown, который выдаёт LLM (заголовки, таблицы, списки задач `- [ ]`). Идеально для экранов «Недельный обзор», «Итоги недели (Insights)», длинных объяснений. Для коротких сообщений (слоты, напоминания, подтверждения) остаёмся на HTML + inline-клавиатуре: проще, проверено временем, гарантированно отображается везде. Ограничения, которые **нужно проверить руками** (документация молчит): минимально поддерживаемая версия клиентов и как выглядит rich-сообщение в старых/сторонних клиентах; поведение `callback_query` для кнопок внутри rich-сообщения (в поле `message` придёт что); условие «business-аккаунт может отправлять rich, если пользователь может» (что означает «может»).

| Элемент | Вердикт |
|---|---|
| `sendRichMessage` (markdown) для длинных структурных ответов | **USE NOW** (пилот за feature-flag, fallback на HTML `sendMessage` при ошибке) |
| Кнопки внутри rich (`<tg-button>`) | **USE LATER** (сначала обычная `reply_markup`) |
| `sendRichMessageDraft` | **USE LATER** |
| `blocks` (явные блоки) | **DON'T USE** (Markdown достаточно) |
| Карты `<tg-map>`, формулы, коллажи | **DON'T USE** |
| `InputRichMessageContent` (inline) | **DON'T USE** пока |

## 5.3 Reply, цитаты, реакции, эффекты

**Факт.**
- [`ReplyParameters`](https://core.telegram.org/bots/api#replyparameters) (7.0): `message_id`, `chat_id` (другой чат, не для business и ephemeral), `allow_sending_without_reply`, `quote` (0–1024 симв., должен быть **точной подстрокой** исходного сообщения, иначе отправка упадёт), `quote_parse_mode`/`quote_entities`, `quote_position`, `checklist_task_id`, `poll_option_id`, `ephemeral_message_id` (ответ на ephemeral — в течение 15 секунд, и только ephemeral-сообщением).
- Реакции: [`setMessageReaction`](https://core.telegram.org/bots/api#setmessagereaction) — боту доступна **одна** реакция; кастомная — только если уже есть на сообщении или разрешена админами; платные (`ReactionTypePaid`) для ботов запрещены. Набор стандартных эмодзи — 73 (в т. ч. 👍 👎 🔥 🎉 🤔 👌 ✍ 🤝 👀 ❤ 🫡). Апдейты `message_reaction` / `message_reaction_count` — только если бот **админ** чата и указал их в `allowed_updates`.
- Эффекты: `message_effect_id` доступен в `sendMessage`/`sendPhoto`/… «только для приватных чатов»; у входящих есть `Message.effect_id`. **Перечня идентификаторов на страницах Bot API нет.**

| Элемент | Вердикт |
|---|---|
| `reply_parameters` (reply на исходную задачу в группе/треде) | **USE NOW** |
| `quote` при ответе на фрагмент | **USE LATER** |
| `setMessageReaction` как ack | **USE NOW** |
| `message_reaction` апдейты | **DON'T USE** (нужны права админа) |
| `message_effect_id` | **USE LATER** / **DON'T USE** для рутинных напоминаний |

## 5.4 Reply-клавиатуры, ForceReply

**Факт** ([ReplyKeyboardMarkup](https://core.telegram.org/bots/api#replykeyboardmarkup), [KeyboardButton](https://core.telegram.org/bots/api#keyboardbutton)):
- Параметры: `is_persistent`, `resize_keyboard`, `one_time_keyboard`, `input_field_placeholder` (1–64 симв.), `selective`, `force_reply` (10.3). Не поддерживаются в каналах и в сообщениях от имени business-аккаунта.
- Кнопки: `text` (по умолчанию отправляется как сообщение), `request_users` (`KeyboardButtonRequestUsers`: `max_quantity` 1–10, `user_is_bot`, `user_is_premium`, `request_name/username/photo`), `request_chat` (`KeyboardButtonRequestChat`: `chat_is_channel`, `chat_is_forum`, `chat_has_username`, `chat_is_created`, права админа, `bot_is_member`), `request_managed_bot`, `request_contact`, `request_location`, `request_poll`, `web_app` — **только приватные чаты**. `request_id` — signed 32-bit, уникален в пределах сообщения.
- Результат: сервисные сообщения `users_shared` / `chat_shared`; «бот может не иметь права использовать полученный идентификатор, если не знает пользователя/чат иначе».
- `ForceReply`: `force_reply`, `input_field_placeholder`, `selective`. Полезен в группах при privacy mode: ответ на такое сообщение доходит до бота.

| Элемент | Вердикт |
|---|---|
| Reply-клавиатура с быстрыми фразами («Сегодня», «Неделя», «Входящие») | **USE LATER** (основной UI — меню + Mini App) |
| `request_contact` / `request_location` | **DON'T USE** (без нужды; телефон и геолокация — лишние данные) |
| `request_users` (выбрать участника встречи) | **USE LATER** |
| `ForceReply` (диалог «Другое время») | **USE LATER** |
| `request_poll`, `request_chat` | **DON'T USE** |

## 5.5 Опросы, чек-листы, кубики, медиа

**Факт.**
- [`sendPoll`](https://core.telegram.org/bots/api#sendpoll): вопрос 1–300 симв.; **1–12** вариантов по 1–100 симв.; регулярный или quiz (`correct_option_ids`, несколько правильных с 9.6); `allows_multiple_answers`, `allows_revoting`, `shuffle_options`, `allow_adding_options`, `hide_results_until_closes`, `open_period` 5–2628000 сек, `close_date`, `description` до 1024, `explanation` до 200 симв. (не более 2 переводов строки), медиа в опросе/вариантах/пояснении (10.0), `members_only`/`country_codes` — только каналы. Апдейты `poll` — только для остановленных и своих опросов; `poll_answer` — только в опросах, отправленных самим ботом.
- Checklists (9.1): [`InputChecklist`](https://core.telegram.org/bots/api#inputchecklist): заголовок 1–255, **1–30** задач по 1–100 симв.; разрешены entity bold/italic/underline/strikethrough/spoiler/custom_emoji/`date_time`. Отправка/редактирование — **только `business_connection_id`** (`sendChecklist`, `editMessageChecklist`). Сервисные `checklist_tasks_done` / `checklist_tasks_added`. Ответ на конкретную задачу: `reply_parameters.checklist_task_id`, во входящем — `reply_to_checklist_task_id`.
- [`sendDice`](https://core.telegram.org/bots/api#senddice): 🎲 🎯 🏀 ⚽ 🎳 🎰; значения 1–6, 1–5, 1–64.
- [`sendMediaGroup`](https://core.telegram.org/bots/api#sendmediagroup): **2–10** элементов (фото, live photo, видео, документы, аудио; документы и аудио — только с себе подобными). `show_caption_above_media` (7.4) для фото/видео/анимации (`sendPhoto`/`sendVideo`/`sendAnimation`/`copyMessage`/`editMessageCaption`). `has_spoiler` — скрыть медиа под спойлером.
- Live photos (10.0): `sendLivePhoto`, видео ≤10 сек и ≤10 МБ, отправка по URL не поддерживается.
- Файлы: `file_id` — без ограничений повторной отправки; по URL: фото до 5 МБ, остальное до 20 МБ; multipart-загрузка: фото до 10 МБ, остальное до 50 МБ; `sendDocument` по URL — только `.PDF` и `.ZIP`; тип файла при повторной отправке по `file_id` менять нельзя; `file_id` уникален для каждого бота, но «можно считать постоянным» ([FAQ](https://core.telegram.org/bots/faq#can-i-count-on-file-ids-to-be-persistent)).

| Элемент | Вердикт |
|---|---|
| `sendPoll` (быстрый опрос времени встречи в группе) | **USE LATER** |
| `sendChecklist` | **DON'T USE** (business-only) |
| Получение `checklist` из пересланных | **USE LATER** |
| `sendDice` | **DON'T USE** |
| `sendMediaGroup`/`show_caption_above_media` | **DON'T USE** (пока; возможно экспорт «недельная сводка» картинкой) |
| ICS-файл как документ (`sendDocument`) | **USE LATER** |

## 5.6 Редактирование, удаление, пересылка, закрепление

**Факт.**
- `editMessageText` / `editMessageCaption` / `editMessageMedia` / `editMessageReplyMarkup` / `editMessageLiveLocation` / `stopMessageLiveLocation` / `stopPoll`. Business-сообщения, отправленные не ботом и без inline-клавиатуры, можно править только **48 часов**. Для inline-сообщений — `inline_message_id`.
- [`deleteMessage`](https://core.telegram.org/bots/api#deletemessage): сообщение должно быть моложе **48 часов**; в приватных чатах бот удаляет и свои, и **входящие** сообщения; dice в личке — только если старше 24 часов. [`deleteMessages`](https://core.telegram.org/bots/api#deletemessages): 1–100 id, отсутствующие пропускаются.
- `forwardMessage`/`forwardMessages`/`copyMessage`/`copyMessages`: 1–100 id строго по возрастанию; сервисные сообщения и сообщения с `protect_content` не пересылаются; копия не содержит ссылки на оригинал; нельзя копировать paid media, giveaway, invoice; quiz — только если известны `correct_option_ids`.
- [`pinChatMessage`](https://core.telegram.org/bots/api#pinchatmessage): в приватных чатах можно закреплять любые несервисные сообщения без прав; уведомления в личках всегда отключены. `unpinChatMessage`, `unpinAllChatMessages`.
- [`sendChatAction`](https://core.telegram.org/bots/api#sendchataction): `typing`, `upload_photo`, `record_video`, `upload_video`, `record_voice`, `upload_voice`, `upload_document`, `choose_sticker`, `find_location`, `record_video_note`, `upload_video_note`; статус до 5 секунд.

> Предположение команды: закреплённое сообщение в личке = «Сегодня» (один пин с сегодняшним планом, редактируется утром). Это дешёвый «виджет» без Mini App: `pinChatMessage` + ежедневный `editMessageText`. Удаление входящих сообщений в личке полезно для «чистого чата», но по умолчанию делать нельзя (пользовательские сообщения — данные пользователя).

| Элемент | Вердикт |
|---|---|
| `editMessageText` / `editMessageReplyMarkup` | **USE NOW** |
| `deleteMessage` (собственные устаревшие напоминания) | **USE NOW** |
| `pinChatMessage` («Сегодня») | **USE LATER** |
| `forwardMessage(s)` / `copyMessage(s)` | **DON'T USE** |
| `deleteMessages` (пакетная очистка) | **USE LATER** |
| `editMessageLiveLocation` | **DON'T USE** |

## 5.7 Команды, имя, описание, меню, deep links

**Факт.**
- [`setMyCommands`](https://core.telegram.org/bots/api#setmycommands): до **100** команд; команда 1–32 символа `[a-z0-9_]`, описание 1–256; `scope` (7 видов: `default`, `all_private_chats`, `all_group_chats`, `all_chat_administrators`, `chat`, `chat_administrators`, `chat_member`), `language_code` (ISO 639-1). Порядок поиска списка команд для пользователя описан в [Determining list of commands](https://core.telegram.org/bots/api#determining-list-of-commands): сначала `chat` + язык, затем без языка, `all_private_chats`, `default`, при этом язык всегда важнее отсутствия языка на том же уровне. `BotCommand.is_ephemeral` (10.2). `getMyCommands`, `deleteMyCommands`.
- Локализация профиля: [`setMyName`](https://core.telegram.org/bots/api#setmyname) (0–64), [`setMyDescription`](https://core.telegram.org/bots/api#setmydescription) (0–512, блок «What can this bot do?»), [`setMyShortDescription`](https://core.telegram.org/bots/api#setmyshortdescription) (0–120) — все с `language_code`; пустая строка удаляет локализацию.
- Меню: [`setChatMenuButton`](https://core.telegram.org/bots/api#setchatmenubutton): `MenuButtonCommands`, `MenuButtonWebApp` (`text`, `web_app` с URL либо `t.me` ссылкой на Mini App), `MenuButtonDefault`; можно на конкретный приватный чат (`chat_id`), напр. текст кнопки по языку.
- Deep links ([features](https://core.telegram.org/bots/features#deep-linking)): `https://t.me/<bot>?start=<param>` → `/start <param>`; `?startgroup=<param>` → `/start@bot <param>`; параметр до **64** символов `A-Za-z0-9_-` (рекомендуется base64url). Mini App: `t.me/<bot>?startapp=<param>` (главное), `t.me/<bot>/<app>?startapp=..`, параметр `startapp` до **512** символов (с 6.8), `mode=compact` (по умолчанию Mini App открывается на полную высоту).
- BotFather: `/setinline`, `/setinlinegeo`, `/setinlinefeedback`, `/setjoingroups`, `/setprivacy`, `/setdomain`, `/setcommands`, а также Mini App-настройки (main Mini App, splash screen).

> Предположение команды: команды на русском не работают (только латиница) — сделать локализованные **описания** для `ru`/`en` (`setMyCommands` c `language_code`), плюс `setMyName`/`setMyDescription`/`setMyShortDescription` для `ru`. Набор: `/start`, `/help`, `/settings` (глобальные команды, которые Telegram просит поддержать) + `/today`, `/week`, `/inbox`. Глубокие ссылки — как одноразовые токены, не содержащие PII (только короткий id, состояние на сервере).

| Элемент | Вердикт |
|---|---|
| `setMyCommands` + `language_code` (`ru`, `en`) | **USE NOW** |
| Scope `all_private_chats` / `all_group_chats` | **USE NOW** |
| `setMyName` / `setMyDescription` / `setMyShortDescription` (`ru`) | **USE NOW** |
| `setChatMenuButton` (Mini App) | **USE NOW** |
| Deep link `start` | **USE NOW** |
| Deep link `startgroup` | **USE LATER** |
| Deep link `startapp` | **USE NOW** |

## 5.8 Ephemeral, Guest, Bot-to-bot, Business, Managed, Communities

**Ephemeral Messages** ([API](https://core.telegram.org/bots/api#ephemeral-messages-and-commands), [features](https://core.telegram.org/bots/features#ephemeral-messages)): приватные сообщения внутри группы для одного участника (`receiver_user_id`). Гарантий доставки нет (пользователь может быть офлайн; сообщения могут исчезнуть при перезапуске клиента). Обычный бот: **в течение 15 секунд** после действия и с `callback_query_id` либо `reply_parameters.ephemeral_message_id`; бот-админ — любому небот-участнику в любое время. `replace_callback_query_message` (10.3) — показать ephemeral «поверх» исходного сообщения. Методы: `editEphemeralMessageText/Media/Caption/ReplyMarkup`, `deleteEphemeralMessage`. Ephemeral-команды (`BotCommand.is_ephemeral`) невидимы для всех, кроме отправителя и бота. `login_url` не поддерживается в ephemeral. У ephemeral `message_id = 0`.
- **USE LATER** (идеально для группового сценария C+E, но после запуска DM).

**Guest Mode** (10.0): см. 4.3. **USE LATER**.

**Bot-to-bot** ([features](https://core.telegram.org/bots/features#bot-to-bot-communication)): включается в BotFather; в группах — через `/cmd@OtherBot` или reply; в личке — `sendMessage` по `@username`. Обязательные защиты от циклов (дедупликация, лимиты, глубина). **DON'T USE** (пока).

**Business / Secretary Mode** ([features](https://core.telegram.org/bots/features#business-bots)): пользователь подключает бота к своему аккаунту (BotFather Secretary Mode); апдейты `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages`; отправка с `business_connection_id`; права `BusinessBotRights` (`can_reply` — ответы только в приватных чатах с входящими за последние 24 часа, `can_read_messages`, `can_delete_*` и др.); в inline-клавиатурах business-сообщений поддерживаются `callback_data`, `url`, `login_url`, `callback_game`, но не `web_app`, `switch_inline_*`; reply-клавиатуры не поддерживаются; на deep link управления боту приходит `/start bizChat<user_chat_id>`. Секретарский режим доступен без Premium (10.0, 10.3). Действуют условия Telegram Bot Developer Terms of Service (раздел 5.4, на который ссылается страница features).
- **USE LATER** — потенциально главный дифференциатор («агент предлагает слоты собеседнику из личных чатов пользователя»), но высокая чувствительность данных и юридические условия.

**Managed Bots** (9.6): боты создают других ботов; **DON'T USE** сейчас. **Communities** (10.2), **Suggested Posts / Direct Messages в каналах** (9.2): **DON'T USE**. **Join Request Queries** (10.1): **DON'T USE**.

## 5.9 Stars и платные возможности (кратко)

**Факт.** Платежи цифровых товаров — только Telegram Stars (`XTR`, 7.4): `sendInvoice`, `createInvoiceLink`, `refundStarPayment`, `getStarTransactions`, `getMyStarBalance`, подписки (`subscription_period`, до 10000 Stars, апдейт `subscription`), paid media (до 25000 Stars), подарки, платные реакции (боту запрещены), Paid Broadcasts (см. раздел 7.2), реклама с разделением дохода 50% ([features](https://core.telegram.org/bots/features#monetization)). Платежи для физических товаров — через провайдеров ([payments](https://core.telegram.org/bots/payments)). **Вердикт для продукта: DON'T USE** сейчас (вне скоупа; монетизация — отдельное решение, возможно Stars-подписка позже).

---

# 6. Mini App (Today / Week / Inbox / Insights / Settings)

Источник: [Mini Apps](https://core.telegram.org/bots/webapps). Скрипт: `<script src="https://telegram.org/js/telegram-web-app.js?63"></script>` в `<head>` перед остальными скриптами → `window.Telegram.WebApp`.

## 6.1 Способы запуска (семь режимов)

| Режим | Особенности | Наш вердикт |
|---|---|---|
| Кнопка reply-клавиатуры `web_app` | Данные обратно через `WebApp.sendData` (до 4096 байт, приложение **закрывается**), сервисное сообщение `web_app_data`; `initData` пуст | **DON'T USE** (потеря сессии) |
| Inline-кнопка `web_app` | Только приватные чаты; `query_id` для `answerWebAppQuery`; данные пользователя, тема | **USE NOW** (из сообщений с кнопкой [Открыть]) |
| Menu button (`setChatMenuButton`) | Идентичен inline-кнопке; можно локализовать/персонализировать | **USE NOW** |
| Main Mini App (BotFather, `t.me/<bot>?startapp`) | Кнопка «Launch app» в профиле; `start_param`, `chat_type`, `chat_instance`; `mode=compact`; превью и скриншоты | **USE NOW** |
| Direct link (`t.me/<bot>/<app>?startapp=..`) | Не имеет доступа к чату; передаёт `start_param` / `tgWebAppStartParam`, `chat_type`, `chat_instance` | **USE LATER** |
| Inline-режим (`InlineQueryResultsButton.web_app`) | Нет доступа к чату; возврат через `switchInlineQuery` | **USE LATER** |
| Attachment menu | Только для крупных рекламодателей; на test server доступно всем | **DON'T USE** |

## 6.2 Аутентификация и валидация `initData`

**Факт** ([Validating data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)):
- `Telegram.WebApp.initData` — query-string; **на сервер отправлять её**, а не `initDataUnsafe` (поля `initDataUnsafe` доверять нельзя).
- **HMAC-SHA256:** ключ подписи = `HMAC_SHA256(<bot_token>, "WebAppData")` (токен — сообщение, `WebAppData` — ключ, как указано в документе); `data_check_string` — все поля кроме `hash`, отсортированные по алфавиту, `key=value`, разделитель `\n`; сравнить `hex(HMAC_SHA256(data_check_string, ключ подписи))` с `hash`.
- Свежесть: проверять `auth_date` (Unix time открытия формы).
- **Ed25519 для третьих сторон** ([Validating data for third-party use](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use), 8.0): передать `initData` и `bot_id`; проверить `signature` (base64url Ed25519) над строкой: `"<bot_id>:WebAppData\n"` + поля (кроме `hash` и `signature`) по алфавиту. Публичные ключи (hex) из документации: **prod** `e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d`, **test** `40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec`. Токен бота третьей стороне не передаётся.
- `WebAppInitData`: `query_id`, `chat_join_request_query_id`, `user` (`WebAppUser`: `id`, `first_name`, `last_name?`, `username?`, `language_code?`, `is_premium?`, `allows_write_to_pm?`, `photo_url?`), `receiver`, `chat`, `chat_type`, `chat_instance`, `start_param`, `can_send_after`, `auth_date`, `hash`, `signature`.

> Предположение команды: серверная проверка HMAC (у нас один бот, токен на бэкенде), Ed25519 нужен только если `initData` пойдёт внешнему сервису. `auth_date` считать протухшим примерно через 1 час (конкретный срок в документации не указан — это наше решение) и сравнивать `hash` за постоянное время. После проверки выдавать собственную короткоживущую сессию (cookie/JWT), а `user.id` использовать как внешний идентификатор.

## 6.3 JS API (проверено по странице)

| Область | Что есть | Версия | Вердикт |
|---|---|---|---|
| Жизненный цикл | `ready()`, `expand()`, `close()`, `isExpanded`, `viewportHeight`, `viewportStableHeight`, событие `viewportChanged`; `isActive`, события `activated`/`deactivated` | 8.0 (active) | **USE NOW** (`ready()` сразу после загрузки скелета) |
| Версия | `Telegram.WebApp.version`, `isVersionAtLeast(v)`, `platform` | — | **USE NOW** (feature-detect) |
| Тема | `themeParams`, `colorScheme`, событие `themeChanged`, CSS-переменные `--tg-theme-*`, `--tg-color-scheme`; цвета `bg_color`, `text_color`, `hint_color`, `link_color`, `button_color`, `button_text_color`, `secondary_bg_color` (6.1), `header_bg_color`/`accent_text_color`/`section_bg_color`/`section_header_text_color`/`subtitle_text_color`/`destructive_text_color` (7.0), `bottom_bar_bg_color` (7.10), `section_separator_color` (7.6) | — | **USE NOW** |
| Цвета шапки/фона | `setHeaderColor`, `setBackgroundColor` (6.1), `setBottomBarColor` (7.10) | — | **USE NOW** |
| Safe area | `safeAreaInset` (`--tg-safe-area-inset-*`), `contentSafeAreaInset` (`--tg-content-safe-area-inset-*`), события `safeAreaChanged` / `contentSafeAreaChanged` | 8.0 | **USE NOW** (обязательно для fullscreen и iOS) |
| Fullscreen / ориентация | `requestFullscreen()`, `exitFullscreen()`, `isFullscreen`, `fullscreenChanged`/`fullscreenFailed`; `lockOrientation()`, `unlockOrientation()`, `isOrientationLocked` | 8.0 | **USE LATER** / **DON'T USE** (для календаря fullscreen не нужен) |
| Свайпы | `enableVerticalSwipes()`, `disableVerticalSwipes()`, `isVerticalSwipesEnabled` | 7.7 | **USE NOW** (отключать на экранах с drag-and-drop календаря) |
| Подтверждение закрытия | `enableClosingConfirmation()`, `disableClosingConfirmation()`, `isClosingConfirmationEnabled` | 6.2 | **USE NOW** (при несохранённой форме) |
| BackButton | `show()`, `hide()`, `onClick`, `offClick`, `isVisible` | 6.1 | **USE NOW** (навигация Today → деталь) |
| MainButton / SecondaryButton (`BottomButton`) | `setText`, `show/hide`, `enable/disable`, `showProgress(leaveActive)`, `hideProgress`, `setParams` (`color`, `text_color`, `has_shine_effect`, `position`, `is_active`, `is_visible`, `icon_custom_emoji_id`), `onClick`; позиции `left`/`right`/`top`/`bottom`; события `mainButtonClicked` / `secondaryButtonClicked` | Secondary 7.10; icon 9.5 | **USE NOW** (Main = «Сохранить», Secondary = «Отмена») |
| SettingsButton | пункт «Settings» в меню приложения (`show`, `hide`, `onClick`, событие `settingsButtonClicked`) | 7.0 | **USE NOW** (открывает раздел Settings) |
| HapticFeedback | `impactOccurred(light\|medium\|heavy\|rigid\|soft)`, `notificationOccurred(error\|success\|warning)`, `selectionChanged()` | 6.1 | **USE NOW** |
| Popups | `showPopup`, `showAlert`, `showConfirm`, событие `popupClosed` | 6.2 | **USE NOW** (подтверждения удаления) |
| Ссылки | `openLink(url, {try_instant_view})` (только по действию пользователя), `openTelegramLink(url)` (приложение не закрывается с 7.0), `openInvoice` | — | **USE NOW** |
| Отправка данных боту | `sendData` (только keyboard-button), `answerWebAppQuery` на сервере | — | **DON'T USE** |
| `switchInlineQuery(query, choose_chat_types)` | переход в inline из Mini App | 6.7 | **USE LATER** |
| `shareMessage(id)` + `savePreparedInlineMessage` | поделиться готовым сообщением | 8.0 | **USE LATER** |
| `shareToStory(media_url, params)` | нативный редактор историй | 7.8 | **DON'T USE** (возможно, для Insights) |
| `requestWriteAccess()` | попап «разрешить боту писать вам»; событие `writeAccessRequested`; сервисное `write_access_allowed` | 6.9 | **USE NOW** (если Mini App открыт по прямой ссылке до старта бота) |
| `requestContact()` | телефон | 6.9 | **DON'T USE** |
| `requestChat(req_id)` + `savePreparedKeyboardButton` | выбор чата | 9.6 | **DON'T USE** |
| `addToHomeScreen()`, `checkHomeScreenStatus()` | ярлык на домашний экран | 8.0 | **USE LATER** |
| `downloadFile({url, file_name})` | нативный попап загрузки; сервер должен отдавать `Content-Disposition: attachment; filename=..` и `Access-Control-Allow-Origin: https://web.telegram.org` | 8.0 | **USE LATER** (экспорт ICS) |
| `readTextFromClipboard` | только из attachment menu | 6.4 | **DON'T USE** |
| `showScanQrPopup` | QR | 6.4 | **DON'T USE** |
| **CloudStorage** | до **1024** ключей на пользователя; ключ 1–128 символов `A-Za-z0-9_-`; значение 0–4096 символов; `setItem/getItem/getItems/removeItem/removeItems/getKeys` | 6.9 | **USE LATER** (кэш UI-настроек; источник истины — наш бэкенд) |
| **DeviceStorage** | локальное хранилище, до **5 МБ** на пользователя, доступ только этому боту; `setItem/getItem/removeItem/clear` | 9.0 | **USE LATER** (кэш) |
| **SecureStorage** | Keychain/Keystore; до **10** элементов на пользователя; `restoreItem` | 9.0 | **DON'T USE** (токены доступа мы не храним на клиенте) |
| BiometricManager | `init`, `requestAccess`, `authenticate`, `updateBiometricToken`, `openSettings` | 7.2 | **DON'T USE** |
| LocationManager, Accelerometer, Gyroscope, DeviceOrientation | сенсоры | 8.0 | **DON'T USE** |
| Emoji status | `setEmojiStatus`, `requestEmojiStatusAccess`; на сервере `setUserEmojiStatus` | 8.0 | **DON'T USE** |
| `hideKeyboard()` | скрыть экранную клавиатуру | 9.1 | **USE LATER** |
| User-Agent на Android | `Telegram-Android/{ver} (...; {LOW\|AVERAGE\|HIGH})` — класс производительности | 8.0 | **USE LATER** |

Дополнительно: `ThemeParams` и события сгруппированы на странице в [Events Available for Mini Apps](https://core.telegram.org/bots/webapps#events-available-for-mini-apps). Список событий: `activated`, `deactivated`, `themeChanged`, `viewportChanged`, `safeAreaChanged`, `contentSafeAreaChanged`, `mainButtonClicked`, `secondaryButtonClicked`, `backButtonClicked`, `settingsButtonClicked`, `invoiceClosed`, `popupClosed`, `qrTextReceived`, `scanQrPopupClosed`, `clipboardTextReceived`, `writeAccessRequested`, `contactRequested`, события биометрии, fullscreen, home screen, сенсоров, геолокации, `shareMessageSent`/`shareMessageFailed`, эмодзи-статуса, `fileDownloadRequested`.

## 6.4 Защита origin (10.2, критично)

**Факт** ([changelog 10.2](https://core.telegram.org/bots/api-changelog#july-14-2026)): методы Mini App запрещены с origin, отличных от домена исходного Mini App; защита включена автоматически для всех Mini App **с 2026-07-20**; отключается в BotFather Mini App, но тогда ответственность за отсутствие ссылок на недоверенные сайты на владельце.

> Предположение команды: не встраивать чужие iframe и не редиректить на другие домены внутри Mini App; вся навигация — внутри одного origin; внешние ссылки — только `openLink`. Проверить это на реальном устройстве (раздел 12).

## 6.5 Прочее для Mini App

- Тестовое окружение: `https://api.telegram.org/bot<token>/test/METHOD_NAME`, отдельные аккаунты; для Mini App допустимы HTTP-URL без TLS только в test environment.
- Дизайн-требования из документации: mobile-first, следить за темой, safe areas, 60 fps, подписи для доступности.
- Для сценария F сильные стороны: `BackButton`, `MainButton`/`SecondaryButton`, `SettingsButton`, `HapticFeedback`, safe-area CSS-переменные, `themeParams` в CSS. Персонализация: `language_code` из `initData` — фактическая локаль интерфейса (русский по умолчанию).

---

# 7. Операции: получение апдейтов, лимиты, ошибки

## 7.1 Webhook против long polling

**Факт** ([getUpdates / setWebhook](https://core.telegram.org/bots/api#getting-updates), [Webhooks guide](https://core.telegram.org/bots/webhooks)):

| Тема | Значение |
|---|---|
| Взаимоисключение | `getUpdates` не работает, пока установлен webhook |
| Хранение апдейтов | на сервере до получения, **не дольше 24 часов** |
| `getUpdates` | `offset` = последний `update_id` + 1 (подтверждение), `limit` 1–100 (по умолчанию 100), `timeout` (long polling), `allowed_updates` |
| `setWebhook` параметры | `url` (HTTPS), `certificate` (публичный сертификат как `InputFile`, для self-signed), `ip_address` (фиксированный IP вместо DNS), `max_connections` **1–100** (по умолчанию **40**), `allowed_updates`, `drop_pending_updates`, `secret_token` (**1–256** символов `A-Za-z0-9_-`) |
| Заголовок | `X-Telegram-Bot-Api-Secret-Token` в каждом запросе, если задан `secret_token` |
| Порты | 443, 80, 88, 8443 |
| Сеть | только IPv4 (IPv6 не поддерживается); входящие с подсетей `149.154.160.0/20` и `91.108.4.0/22`; TLS 1.2+; CN/SAN должен совпадать с доменом; нужны промежуточные сертификаты |
| Ответ не 2xx | «повторяем запрос и сдаёмся после разумного числа попыток» — **число и интервалы не указаны** |
| `getWebhookInfo` | `url`, `has_custom_certificate`, `pending_update_count`, `ip_address`, `last_error_date`, `last_error_message`, `last_synchronization_error_date`, `max_connections`, `allowed_updates` |
| Ответ вебхука методом | можно ответить телом запроса к Bot API (`method` в JSON/form), но **результат недоступен** |
| Редиректы | не поддерживаются; wildcard-сертификаты «могут не поддерживаться» ([FAQ](https://core.telegram.org/bots/faq#im-having-problems-with-webhooks)) |
| `allowed_updates` по умолчанию | все, **кроме** `chat_member`, `message_reaction`, `message_reaction_count` |

**`update_id`:** возрастает последовательно, «позволяет игнорировать повторы или восстанавливать порядок»; если апдейтов не было ≥ недели, следующий id выбирается **случайно**.

> Предположение команды: для продакшена — **webhook** (нет постоянного соединения, проще масштабировать), long polling — для локальной разработки. Ordering: при `max_connections` > 1 порядок обработки не гарантирован → идемпотентность по `update_id` (таблица «обработано») и последовательная обработка **по ключу чата** (очередь на `chat.id`) либо `max_connections=1` на старте. Отвечать 200 быстро (grammY по умолчанию ждёт 10 секунд и дальше бросает таймаут) и выносить работу LLM в очередь. `allowed_updates` задавать явным белым списком: `message`, `edited_message`, `callback_query`, `my_chat_member`, `inline_query`/`chosen_inline_result` (когда включим), `business_*` (позже), `stopped_message_generation`, `guest_message` (позже).

## 7.2 Лимиты и ошибки

**Факт** ([FAQ: лимиты](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)):
- В одном чате — не более **~1 сообщения/сек** (короткие всплески допустимы, потом 429).
- В группе — не более **20 сообщений/мин**.
- Массовые рассылки — не более **~30 сообщений/сек**.
- Ошибка 429 содержит `ResponseParameters.retry_after` (секунды).
- **Paid Broadcasts** (`allow_paid_broadcast`, 7.11): до 1000 сообщений/сек, 0.1 Stars за каждое сообщение сверх 30/сек, списывается только за успешные. Условия включения **расходятся между страницами**: API-справочник — не менее **10 000** Stars на балансе; FAQ — не менее **100 000** Stars и 100 000 MAU. Считать неопределённым (раздел 12).
- Тестовая среда не поднимает лимиты и может быть строже.
- BotFather шлёт **status alerts**, если мало ответов на сообщения/inline/callback (порог ~300 запросов/мин у популярных ботов).
- `ResponseParameters.migrate_to_chat_id` — группа переехала в супергруппу.
- `error_code` в ответе «может измениться в будущем»: опираться на `description` и `parameters`.
- Ошибки на страницах Bot API **не перечислены**. В документации **нет** текстов «bot was blocked by the user», «message is not modified», «query is too old». Известно только: при блокировке бота в личке приходит `my_chat_member`; `getUpdates` при активном webhook не работает.

> Предположение команды (не из документации, проверить на живом боте): обрабатывать HTTP 403 (бот заблокирован/пользователь недоступен) как «отписать пользователя, остановить напоминания»; HTTP 400 «message is not modified» — игнорировать; 400 «query is too old…» у `answerCallbackQuery` — игнорировать (отвечать нужно сразу, до тяжёлой работы); 409 Conflict — почти всегда два инстанса с `getUpdates` или webhook + polling. Реализовать общий слой: `retry_after` → отложить очередь этого чата; ошибки 5xx/сетевые — экспоненциальный backoff (grammY `auto-retry` делает так: старт 3 секунды, максимум час; `transformer-throttler` ограничивает исходящий поток).

## 7.3 Размеры файлов и Local Bot API

**Факт:** скачивание `getFile` до 20 МБ; загрузка multipart: фото до 10 МБ, остальное до 50 МБ; по URL: фото 5 МБ, остальное 20 МБ; `sendVoice` до 50 МБ. Локальный сервер ([features](https://core.telegram.org/bots/features#local-bot-api)): скачивание без лимита, загрузка до 2000 МБ, webhook по HTTP на любом порту и локальный IP, `max_connections` до 100000. Перед переездом — [`logOut`](https://core.telegram.org/bots/api#logout) (вернуться в облако нельзя 10 минут); [`close`](https://core.telegram.org/bots/api#close) при переносе между локальными серверами (первые 10 минут после запуска — 429). Локальному серверу нужен TLS-терминатор для внешнего HTTPS. **Вердикт: DON'T USE** на старте.

## 7.4 Тестирование

**Факт:** отдельный бот через @BotFather для тестового экземпляра (`file_id` привязан к боту — файлы придётся перезагружать); полностью отдельная **test environment** (`.../bot<token>/test/METHOD`, отдельные аккаунты, HTTP-ссылки разрешены для Mini App/Login).

---

# 8. Безопасность

**Факт из документации** плюс **Предположения команды** (по пунктам).

| Тема | Что делаем |
|---|---|
| Токен бота | Факт: токен даёт полный контроль над ботом; `/token` в BotFather перевыпускает. Команда: хранить только в секрет-хранилище; **никогда не логировать** URL запросов (в них есть `bot<token>`), маскировать в логах, ошибках, трассировках и `getFile`-ссылках. |
| Секрет webhook | Факт: заголовок `X-Telegram-Bot-Api-Secret-Token`. Команда: длинный случайный `secret_token` (32+ символов из разрешённого алфавита), сравнение **за постоянное время**; отдельный секретный путь в URL как дополнительный слой. grammY реализует сверку `secretToken` внутри `webhookCallback` (функция сравнения в исходниках 1.46.0) — проверить, что она константного времени, иначе сравнивать самим. Опционально фильтр по подсетям Telegram (раздел 7.1). |
| `callback_data` | Факт: до 64 байт; данные приходят от клиента. Команда: **не хранить в кнопке ничего чувствительного**; только короткий непрозрачный id, версия схемы (`s1:`) и, при необходимости, укороченная HMAC-подпись; на сервере проверять, что `callback_query.from.id` — владелец предложения (в группах — что нажимает разрешённый участник), срок жизни и одноразовость; на любое нажатие отвечать `answerCallbackQuery`. |
| Идемпотентность | Команда: ключ `update_id` (веб-хук), плюс ключ действия `(предложение, действие)`. |
| Права в группах | Факт: `getChatMember` «гарантированно работает для других пользователей только если бот админ». Команда: не строить логику на `getChatMember` для обычного участника. |
| `initData` | Факт: HMAC/Ed25519, `auth_date`. Команда: срок жизни, сравнение хэша за постоянное время, `initDataUnsafe` не использовать на сервере. |
| Мини-приложение | Команда: строгая CSP, единый origin (10.2), никаких токенов доступа в `localStorage`/`DeviceStorage`; сессия — HttpOnly cookie или короткий токен в памяти. |
| Inline | Факт: «все URL в результатах публичны». Команда: `is_personal`, минимум данных. |
| Ephemeral / Guest | Факт: гарантий доставки нет. Команда: не использовать как единственный канал для критичных действий. |
| Bot-to-bot | Факт: обязательны защиты от циклов. Команда: пока не включать. |
| Логи и PII | Команда: не логировать тексты сообщений, содержимое календаря, `file_path`; хранить `user.id`, но не имена. |

---

# 9. Сравнение библиотек и версии Bot API

Проверено 2026-09-26 (`npm view`, `npm pack`, PyPI).

| Библиотека | Последняя версия | Дата | Заявленная версия Bot API | Комментарий |
|---|---|---|---|---|
| **grammy** (npm) | **1.46.0** | 2026-08-26 | **10.3** (бейдж README, типы 5.0.0) | Полное покрытие: `replyWithDraft`, `replyWithRichMessage`, `replyWithRichMessageDraft`, `Ephemeral*`, `guest_message`, `stopped_message_generation`. Webhook `secretToken`, таймаут 10 секунд по умолчанию. |
| **@grammyjs/types** | **5.0.0** (`latest`) | 2026-08-25 | 10.3 (в типах есть все объекты 10.3) | Только типы. |
| **telegraf** (npm) | 4.16.3 | 2026-03-06 | **7.1** (бейдж README; зависимость `@telegraf/types ^7.1.0`) | **Сильно отстаёт**: нет `sendMessageDraft`/Rich; последний релиз в марте 2026. `@telegraf/types` 9.2.1 (сентябрь 2025, Bot API 9.2) существует, но сам telegraf на него не переехал. |
| **node-telegram-bot-api** (npm) | 2.1.0 | 2026-09-07 | **10.3** (бейдж README) | v2 — «переписан с нуля, без совместимости с v1». Есть `richmessage` в исходниках. Новее, но экосистема плагинов меньше. |
| **typescript-telegram-bot-api** (npm) | 0.19.0 | 2026-08-24 | не заявлена бейджем; в бандле есть `sendMessageDraft` и `sendRichMessage` | Тонкая обёртка без фреймворка. |
| **aiogram** (PyPI) | 3.31.0 | 2026-08-26 | **10.3** | Актуален. |
| **python-telegram-bot** (PyPI) | 22.8 | 2026-06-12 | **10.0** | Отстаёт на 3 минорных версии (нет Rich, ephemeral, draft-стоп). |
| **pyTelegramBotAPI** (PyPI) | 4.37.0 | 2026-09-21 | **10.3** | Актуален. |

Плагины grammY (документация через Context7, [grammY website](https://grammy.dev)): `@grammyjs/runner` (конкурентная обработка при long polling; см. «Scaling Up»), `auto-retry` (обработка 429 по `retry_after`, ретраи 5xx и сетевых ошибок), `transformer-throttler` (очередь исходящих запросов на базе Bottleneck), `hydrate`, `conversations`, `parse-mode`, `ratelimiter`.

> Предположение команды: **grammY** — единственная TypeScript-опция, которая (а) покрывает 10.3 целиком, (б) имеет зрелую middleware-экосистему. Telegraf брать нельзя (7.1). Версию `grammy` пинить точной (`1.46.x`), так как Bot API движется быстро (10.0 → 10.3 за 3.5 месяца).

---

# 10. Матрица использования

Сводная таблица. Столбец «Сц.» — сценарии продукта. Источник версии и деталей — соответствующие разделы выше.

| # | Возможность | Версия | Сц. | Вердикт | Почему |
|---|---|---|---|---|---|
| 1 | Inline-клавиатура + `callback_data` + `answerCallbackQuery` | базовое | A, G | **USE NOW** | Основной цикл «предложить → подтвердить» |
| 2 | `style` кнопок (`primary`/`success`/`danger`) | 9.4 | A, G | **USE NOW** | Нативные цвета, нет эмодзи-костылей |
| 3 | `DisabledButton` | 10.3 | A | **USE NOW** | Защита от двойного нажатия и итоговое состояние |
| 4 | `editMessageText` / `editMessageReplyMarkup` | базовое | A, G | **USE NOW** | Без спама новыми сообщениями |
| 5 | `date_time` entity (`tg-time`) | 9.5 | A, G | **USE NOW** | Время в локальной зоне читателя |
| 6 | `parse_mode: HTML` | базовое | все | **USE NOW** | Простое экранирование |
| 7 | `MarkdownV2` | базовое | — | **DON'T USE** | Хрупкое экранирование |
| 8 | `sendRichMessage` (Markdown) | 10.1 | I, F | **USE NOW** | Длинные структурные ответы, пилот с fallback |
| 9 | `sendMessageDraft` | 9.3/9.5 | I | **USE NOW** | Нативный стриминг |
| 10 | `can_stop` + `stopped_message_generation` | 10.3 | I | **USE NOW** | Отмена LLM |
| 11 | `sendRichMessageDraft` | 10.1 | I | **USE LATER** | Проверить клиентов |
| 12 | `link_preview_options` | 7.0 | все | **USE NOW** | Отключать предпросмотры |
| 13 | `forward_origin` (4 типа) | 7.0 | B | **USE NOW** | Классификация пересланных |
| 14 | Агрегация `media_group_id` | базовое | B | **USE NOW** | Альбомы |
| 15 | Приём `date_time` entity | 9.5 | B, A | **USE NOW** | Готовое время |
| 16 | `voice` + `getFile` (20 МБ) + STT | базовое | H | **USE NOW** | Голос → задача |
| 17 | `sendChatAction` | базовое | H, I | **USE NOW** | Индикатор работы |
| 18 | `setMessageReaction` как ack | 7.0 | B, G | **USE NOW** | Быстрое подтверждение |
| 19 | `message_reaction` апдейты | 7.0 | — | **DON'T USE** | Нужны права админа |
| 20 | `setMyCommands` + scope + `language_code` | базовое | все | **USE NOW** | Локализация ru/en |
| 21 | `setMyName`/`Description`/`ShortDescription` | 6.6/6.7 | все | **USE NOW** | Русский профиль |
| 22 | `setChatMenuButton` (Mini App) | 6.0 | F | **USE NOW** | Вход в Mini App |
| 23 | Deep link `start` / `startapp` | базовое | все | **USE NOW** | Онбординг, Mini App |
| 24 | Privacy mode (включён) | базовое | C | **USE NOW** | Минимум данных |
| 25 | Распознавание mention/reply/command по entities | базовое | C | **USE NOW** | Нет `has_mention` |
| 26 | `reply_parameters` / `message_thread_id` | 7.0 | C | **USE NOW** | Ответ в тред |
| 27 | `quote` / `external_reply` | 7.0 | C | **USE LATER** | Контекст задачи |
| 28 | Ephemeral Messages | 10.2/10.3 | C, E | **USE LATER** | Приватность в группе |
| 29 | Guest Mode | 10.0 | C | **USE LATER** | Вызов из любого чата |
| 30 | Inline mode (`answerInlineQuery`, `is_personal`) | базовое | D | **USE LATER** | Делиться слотами |
| 31 | `savePreparedInlineMessage` + `shareMessage` | 8.0 | D, F | **USE LATER** | Поделиться из Mini App |
| 32 | `switch_inline_query*` | 6.7 | D | **USE LATER** | Часть D |
| 33 | Mini App: inline/menu/main запуск | 6.0/7.8 | F | **USE NOW** | Today/Week/Inbox/Insights/Settings |
| 34 | `initData` HMAC + `auth_date` | 6.0 | F | **USE NOW** | Аутентификация |
| 35 | `initData` Ed25519 | 8.0 | F | **USE LATER** | Нужно только третьим сторонам |
| 36 | BackButton / MainButton / SecondaryButton / SettingsButton | 6.1–7.10 | F | **USE NOW** | Нативная навигация |
| 37 | HapticFeedback, popups, closing confirmation, safe area, theme | разное | F | **USE NOW** | Нативность |
| 38 | `requestWriteAccess` | 6.9 | F, G | **USE NOW** | Право писать напоминания |
| 39 | CloudStorage / DeviceStorage | 6.9 / 9.0 | F | **USE LATER** | Клиентский кэш |
| 40 | SecureStorage, Biometric | 9.0 / 7.2 | F | **DON'T USE** | Не храним секреты на клиенте |
| 41 | Fullscreen, ориентация, сенсоры, геолокация | 8.0 | F | **DON'T USE** | Лишнее для календаря |
| 42 | `addToHomeScreen`, `downloadFile` | 8.0 | F | **USE LATER** | Ярлык, ICS |
| 43 | `shareToStory`, эмодзи-статус | 7.8 / 8.0 | F | **DON'T USE** | Вне скоупа |
| 44 | Business / Secretary Mode | 7.2+ | B, C | **USE LATER** | Сильный дифференциатор, чувствителен |
| 45 | `sendChecklist` / `editMessageChecklist` | 9.1 | — | **DON'T USE** | Только business |
| 46 | Приём `checklist` из пересланных | 9.1 | B | **USE LATER** | Источник задач |
| 47 | `sendPoll` | базовое | C | **USE LATER** | Опрос времени в группе |
| 48 | `message_effect_id` | 7.4 | G | **USE LATER** | Нет списка ID |
| 49 | `copy_text` кнопка | 7.11 | A | **USE LATER** | Скопировать ссылку |
| 50 | `icon_custom_emoji_id`, custom emoji | 9.4 | — | **DON'T USE** | Зависит от Premium владельца |
| 51 | `pinChatMessage` (Today) | базовое | G | **USE LATER** | Виджет «Сегодня» |
| 52 | `forwardMessage(s)` / `copyMessage(s)` | 7.0 | — | **DON'T USE** | Нет нужды |
| 53 | `deleteMessage(s)` | 7.0 | G | **USE NOW** / **USE LATER** | Своё — сразу; пакетно — позже |
| 54 | Topics в личке (`createForumTopic`) | 9.3/9.4 | E | **USE LATER** | Раздельные потоки (Inbox / Работа) |
| 55 | Webhook + `secret_token` + `allowed_updates` | базовое | ops | **USE NOW** | Продакшен |
| 56 | Local Bot API server | — | H | **DON'T USE** | Не нужен |
| 57 | Paid broadcasts | 7.11 | G | **DON'T USE** | Вне скоупа |
| 58 | Telegram Login (OIDC) | см. страницу | E | **USE LATER** | Веб-онбординг |
| 59 | Stars, платежи, подарки, paid media | 7.4+ | — | **DON'T USE** | Вне скоупа |
| 60 | Managed bots, Communities, Direct Messages/Suggested posts, Join Request Queries, Bot-to-bot | 9.2–10.2 | — | **DON'T USE** | Вне скоупа |

---

# 11. 15 самых ценных возможностей Bot API для нашего продукта

По убыванию приоритета (сочетание ценности для сценариев A–I и стоимости внедрения).

1. **`InlineKeyboardMarkup` + `callback_data` + `answerCallbackQuery` + `editMessage*`** — весь цикл «предложить слоты → подтвердить» (A, G).
2. **`sendMessageDraft`** с `can_stop` и `stopped_message_generation` — нативный стриминг ответа агента (I).
3. **Mini App** (menu button, main Mini App, inline `web_app`) + **валидация `initData` (HMAC, `auth_date`)** (F).
4. **`style` кнопок + `DisabledButton`** — нативные цвета и защита от повторных нажатий (A, G).
5. **`date_time` entity (`tg-time`) на выход и на вход** — время в локальной зоне и готовое время из чужих сообщений (A, B).
6. **`sendRichMessage` (Rich Markdown)** — длинные структурные ответы и Insights (I, F), пилот с fallback.
7. **`forward_origin`** (все типы, включая скрытых отправителей) + агрегация `media_group_id` (B).
8. **`voice` → `getFile` → STT** и `sendChatAction` (H).
9. **Webhook с `secret_token`, явным `allowed_updates` и дедупликацией по `update_id`** — фундамент надёжности.
10. **`setMyCommands` (`scope` + `language_code`), `setMyName`/`Description`** — русскоязычный профиль и меню.
11. **Privacy mode + распознавание mention/reply/command по `entities`, `reply_parameters`, `message_thread_id`** — тихая группа (C).
12. **Deep links `start` / `startapp`** — онбординг и вход в Mini App.
13. **`requestWriteAccess`** и `my_chat_member` — право писать и обработка блокировок (G).
14. **`setMessageReaction`** как мгновенный ack (B, G).
15. **Обработка `429 retry_after`** (grammY `auto-retry` + `transformer-throttler`) и лимиты 1 msg/сек на чат — надёжность рассылки напоминаний (G).

Кандидаты «после запуска»: Ephemeral Messages (C/E), Guest Mode (C), Business / Secretary Mode, inline-шеринг слотов + prepared messages (D), Telegram Login OIDC, CloudStorage-кэш.

---

# 12. Открытые вопросы / проверить руками

Всё ниже требует реального бота (или уточнения у @BotSupport): документация молчит или противоречива.

1. **Privacy mode и @mention.** Доставляется ли в privacy-режиме обычное сообщение с `@бот` (без reply и без команды)? По документации не перечислено. Проверить в группе и супергруппе, в теме форума, и когда в чате есть другие privacy-боты (приоритет «одно сообщение — один privacy-бот»).
2. **Поведение после смены privacy mode.** Действительно ли нужно удалить и заново добавить бота; что будет с уже добавленными группами.
3. **Guest Mode на практике.** Достаточно ли одного ответа; как передаётся контекст; ограничения по типам чатов («supported chat»); можно ли в ответ прикрепить inline-клавиатуру и получить `callback_query` (`inline_message_id`).
4. **Лимит частоты `sendMessageDraft`/`sendRichMessageDraft`.** Не указан; замерить безопасную частоту обновлений и поведение при превышении; что видит пользователь после 30 секунд без финала; поведение `keep_on_stop`.
5. **Rich Messages.** Минимальная версия клиента, вид на iOS/Android/Desktop/Web/сторонних клиентах, что происходит на устаревших клиентах; лимит на кнопки; что приходит в `callback_query.message` для кнопок внутри rich-сообщения; смысл «business-аккаунт может отправлять rich-сообщения, если соответствующий пользователь может».
6. **`date_time` entity в старых клиентах** — что показывают вместо форматированной даты; корректность формата `wDt` для русской локали.
7. **`DisabledButton` и `style`** — рендер на клиентах, откат на старых.
8. **Формат голосовых.** Реальный `mime_type` входящих `voice` на всех платформах (ожидаем OGG/Opus, документация не фиксирует); поведение для голосовых из пересланных сообщений и для `video_note`.
9. **Тексты и коды ошибок** (403 блокировка, 400 «message is not modified», 400 «query is too old», 409) — в справочнике не описаны; зафиксировать реальные ответы.
10. **Ретраи webhook.** Число попыток, интервалы, поведение при долгих ответах (>10 секунд); влияние `max_connections` на порядок; поведение при 5xx.
11. **Paid Broadcasts.** Порог для включения: 10 000 Stars (API) или 100 000 Stars и 100 000 MAU (FAQ) — уточнить в BotFather.
12. **Ephemeral в группах.** Задержки и потеря доставки; что видит пользователь на устаревших клиентах; работает ли в темах.
13. **Mini App: защита origin (10.2).** Проверить запуск на iOS/Android/Desktop/Web без iframe и редиректов; поведение `openLink`/`openTelegramLink` и `downloadFile` (заголовки `Content-Disposition`, `Access-Control-Allow-Origin: https://web.telegram.org`).
14. **Приватные темы (`has_topics_enabled`).** Включение в BotFather, поведение `message_thread_id` в личке, `sendMessageDraft` в теме, влияние на UX «одного чата».
15. **`message_effect_id`.** Где взять актуальные идентификаторы (в документации нет).
16. **Business/Secretary.** Права по умолчанию, влияние окна 24 часов на `can_reply`, требования Developer Terms 5.4 к нашему сценарию.
17. **Часовой пояс и локаль.** Единственный сигнал от Bot API — `language_code`; проверить, как `date_time` отображается для пользователя с русской локалью и нестандартной зоной; решить, откуда брать TZ (онбординг / Mini App).
18. **`callback_query` без `message`** (если сообщение недоступно): проверить `MaybeInaccessibleMessage` при старых сообщениях (>48 часов) и редактирование таких сообщений.
19. **Идентификаторы >32 бита** (`Chat.id`, `User.id`): проверить, что все слои (БД, JSON, JS `number`) хранят их без потери точности (до 52 значащих бит).

---

# Приложение: карта якорей (для быстрого поиска)

- API: [getUpdates](https://core.telegram.org/bots/api#getupdates), [setWebhook](https://core.telegram.org/bots/api#setwebhook), [WebhookInfo](https://core.telegram.org/bots/api#webhookinfo), [Message](https://core.telegram.org/bots/api#message), [MessageEntity](https://core.telegram.org/bots/api#messageentity), [MessageOrigin](https://core.telegram.org/bots/api#messageorigin), [ReplyParameters](https://core.telegram.org/bots/api#replyparameters), [LinkPreviewOptions](https://core.telegram.org/bots/api#linkpreviewoptions), [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton), [KeyboardButton](https://core.telegram.org/bots/api#keyboardbutton), [CallbackQuery](https://core.telegram.org/bots/api#callbackquery), [sendMessage](https://core.telegram.org/bots/api#sendmessage), [sendMessageDraft](https://core.telegram.org/bots/api#sendmessagedraft), [sendRichMessage](https://core.telegram.org/bots/api#sendrichmessage), [sendRichMessageDraft](https://core.telegram.org/bots/api#sendrichmessagedraft), [Rich messages](https://core.telegram.org/bots/api#rich-messages), [Formatting options](https://core.telegram.org/bots/api#formatting-options), [Date-time entity formatting](https://core.telegram.org/bots/api#date-time-entity-formatting), [Ephemeral messages](https://core.telegram.org/bots/api#ephemeral-messages-and-commands), [Paid broadcasts](https://core.telegram.org/bots/api#paid-broadcasts), [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery), [answerGuestQuery](https://core.telegram.org/bots/api#answerguestquery), [setMyCommands](https://core.telegram.org/bots/api#setmycommands), [setChatMenuButton](https://core.telegram.org/bots/api#setchatmenubutton), [answerInlineQuery](https://core.telegram.org/bots/api#answerinlinequery), [savePreparedInlineMessage](https://core.telegram.org/bots/api#savepreparedinlinemessage), [getFile](https://core.telegram.org/bots/api#getfile), [Local Bot API server](https://core.telegram.org/bots/api#using-a-local-bot-api-server).
- Features: [privacy mode](https://core.telegram.org/bots/features#privacy-mode), [deep linking](https://core.telegram.org/bots/features#deep-linking), [streaming replies](https://core.telegram.org/bots/features#streaming-replies), [guest bots](https://core.telegram.org/bots/features#guest-bots), [business bots](https://core.telegram.org/bots/features#business-bots), [Local Bot API](https://core.telegram.org/bots/features#local-bot-api).
- Mini Apps: [Initializing](https://core.telegram.org/bots/webapps#initializing-mini-apps), [ThemeParams](https://core.telegram.org/bots/webapps#themeparams), [CloudStorage](https://core.telegram.org/bots/webapps#cloudstorage), [DeviceStorage](https://core.telegram.org/bots/webapps#devicestorage), [SecureStorage](https://core.telegram.org/bots/webapps#securestorage), [WebAppInitData](https://core.telegram.org/bots/webapps#webappinitdata), [Validating data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [Third-party validation](https://core.telegram.org/bots/webapps#validating-data-for-third-party-use), [Events](https://core.telegram.org/bots/webapps#events-available-for-mini-apps).
- FAQ: [what messages will my bot get](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get), [limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
- Webhooks: [Webhooks guide](https://core.telegram.org/bots/webhooks).
