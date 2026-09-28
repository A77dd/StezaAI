# Manual QA: Telegram Bot — Forwards, Albums, Voice

> Run against local polling or deployed webhook. Bot token required.

## Prerequisites

```bash
# Local polling (dev)
npm run dev:bot          # or: node scripts/start-bot-polling.js

# Or deployed webhook
# POST https://your-domain/api/telegram/webhook with secret token
```

---

## 1. Forwarded Messages (Single)

### 1.1 Task-like forward
1. In any chat, write: «Нужно подготовить отчёт до пятницы, два часа»
2. Forward that message to the bot (private chat)
3. **Expected**: Bot shows card «Похоже, это задача: "подготовить отчёт до пятницы"» + 1-3 slot buttons + [Это встреча] [Напомнить] [Просто запомнить]

### 1.2 Meeting-like forward
1. Forward: «Встреча с командой завтра в 15:00 про бюджет»
2. **Expected**: when an explicit future time is clear and free, the meeting is booked immediately; the card shows the time, optional link, reminder toggle, time-change action, and delete action

### 1.3 Reminder-like forward
1. Forward: «Не забудь позвонить маме»
2. **Expected**: Card with «Похоже, нужно не забыть про...» + slots

### 1.4 Info-only forward
1. Forward: «Статья про новые фичи Telegram»
2. **Expected**: Card «Здесь нет задачи, это скорее информация: "Статья про...". Запомнить?» + [Запомнить] button

### 1.5 Hidden origin (forwarded from user who hides forwards)
1. Forward from user with «Hide forwards» privacy setting
3. **Expected**: meeting capture still works when time is clear; the card notes that Telegram did not provide the sender's `@username`

---

## 2. Forwarded Albums (Media Groups)

### 2.1 Screenshots album
1. Take 3 screenshots in Telegram (album)
2. Forward the whole album to bot
3. **Expected**: Single card aggregating all images as one source, text from caption or OCR (if implemented)

### 2.2 Mixed album (photos + text)
1. Create album with photo + text message
2. Forward to bot
3. **Expected**: Single forward card, not multiple separate cards

---

## 3. Voice Messages

### 3.1 Voice unavailable (default composition)
1. Send voice message to bot (without `voiceFileDownload` service)
2. **Expected**: Reply «Сейчас голосовые сообщения недоступны. Напиши текстом, пожалуйста.» — no `getFile` call

### 3.2 Voice with transcription (stub enabled)
1. Enable stub transcription in test harness
2. Send voice (OGG/Opus, < 20 MB)
3. **Expected**:
   - Bot sends `sendChatAction(record_voice)` while processing
   - Calls `getFile` → downloads → transcribes
   - Creates task from transcript with voice provenance
   - Source shows `sourceType: "direct_message"`, `sourceText: "<transcript>"`

### 3.3 Oversized voice (> 20 MB)
1. Send voice with `file_size > 20 MB`
2. **Expected**: Reply «Голосовое слишком большое. Отправь запись до 20 МБ или напиши текстом.» — no `getFile`

### 3.4 Unsupported MIME type (e.g., WAV)
1. Send voice with `mime_type: "audio/wav"`
2. **Expected**: Reply «Этот формат голосового не поддерживается. Отправь OGG/Opus или напиши текстом.» — no `getFile`

### 3.5 Transcription provider error
1. Configure stub to return `unavailable`
2. Send voice
3. **Expected**: Reply «Не получилось разобрать голосовое. Напиши текстом, пожалуйста.» — no transcript in logs, no file IDs in logs

### 3.6 Empty transcript
1. Configure stub to return empty string
2. Send voice
3. **Expected**: Same as transcription unavailable

---

## 4. Slot Proposal & Booking (Regression)

### 4.1 Normal flow
1. Send: «Задача до пятницы, 2 часа»
2. Press slot button → card becomes booked (green checkmark, disabled button)
4. Press same button again → toast «Это действие уже выполнено»

### 4.2 Double-press race
1. Send task, get proposal card
2. Rapidly press same slot button twice (simulate: `Promise.all([press, press])`)
4. **Expected**: Exactly one booking, one reminder set, both callbacks answered

### 4.3 Stale proposal (calendar conflict)
1. Book a slot, then simulate calendar conflict on second press
2. **Expected**: Shows conflict notice, original card preserved with buttons

---

## 5. Settings & Commands

| Command | Expected |
|---------|----------|
| `/start` | Welcome card with calendar connect hint |
| `/help` | List of 5 commands with descriptions |
| `/settings` | Toggle rows with primary style on current, danger on calendar disconnect |
| `/export` | JSON file `steza-export.json` with all user data |
| `/deleteme` | Two-step confirmation card [Да, удалить] [Отмена] |

---

## 6. Native Telegram Features Verification

| Feature | How to Verify |
|---------|---------------|
| `date_time` entity (`<tg-time>`) | Slot time shows in YOUR local timezone, not bot's |
| Button `style: success` | Green [Поставить] buttons |
| Button `style: danger` | Red [Отмена]/[Отключить] buttons |
| Button `style: primary` | Blue [Другое время]/[Изменить] buttons |
| `DisabledButton` | After booking: gray «✅ Поставлено» button, unclickable |
| `copy_text` | «Скопировать время» copies plain text to clipboard |
| `sendChatAction(record_voice)` | Voice shows "recording..." indicator while processing |

---

## 7. Test Commands (curl)

```bash
# Get webhook info
curl -X POST "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Delete webhook (switch to polling)
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook?drop_pending_updates=true"

# Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain/api/telegram/webhook","secret_token":"<SECRET>","allowed_updates":["message","edited_message","callback_query","my_chat_member","inline_query","guest_message","stopped_message_generation"],"max_connections":20}'
```

---

## 8. Known Limitations (Current Baseline)

- **No real STT**: Uses `StubTranscription` — returns `TranscriptionUnavailableError`
- **No calendar integration**: In-memory calendar only
- **No reminder worker**: Reminders can be queued but `block_start`/`check_in` messages are not dispatched
- **No group handling**: Privacy mode, mentions, Guest Mode — not yet implemented
- **No inline mode**: `inline_query` not registered
- **No webhook route**: `src/app/api/telegram/webhook/route.ts` not yet created

## 8.1. Forwarded meeting with a clear time

The interaction uses in-memory calendar and reminder adapters. The five-minute details follow-up uses a local process timer and is not durable across restart. A one-hour reminder is queued, but a worker is not configured to deliver it.

1. Forward a future invitation with a time and optional meeting URL.
2. **Expected:** the bot adds it to the local calendar immediately and shows a meeting card. The reminder is enabled by default and can be toggled; the other actions change the time or delete the event.
3. Send one more text message with context. **Expected:** the text is added to the event details and the original card updates.
4. Leave the bot idle for five minutes. **Expected:** it sends a quiet follow-up with an **Добавить информацию** button.
5. Repeat with a hidden sender. **Expected:** the card has a small note that the sender's `@username` could not be obtained; the event still belongs to the user.
6. Occupy the requested interval in the in-memory calendar and repeat. **Expected:** no existing block changes; the bot proposes free slots after the requested interval.
7. Press **Изменить время** and send a free future time. **Expected:** the existing event moves and its reminder is recalculated. Send a busy time instead; **expected:** the old event remains in place and the bot asks for another time.

The local runtime still uses a deterministic parser stand-in. This check does not validate LLM interpretation or a connected external calendar. See [ADR 0004](../decisions/0004-forwarded-meeting-capture.md).

---

## 9. Smoke Test Checklist (Pre-Deploy)

- [ ] `/start` → welcome card renders
- [ ] Text task → proposal with 1-3 green slot buttons
- [ ] Slot press → booked card with disabled button + copy button
- [ ] Forward text → clarify card with intent buttons
- [ ] Forward album → single aggregated card
- [ ] Voice → "unavailable" notice (or transcript with stub)
- [ ] `/settings` → toggles with primary style on current
- [ ] `/export` → downloads JSON
- [ ] `/deleteme` → confirms → data gone
- [ ] All buttons answer callback (no spinner stuck)
- [ ] Double-press race handled
- [ ] Logs contain no PII, no tokens, no file IDs
