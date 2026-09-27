import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Slot } from "../src/features/telegram/domain";
import { createRichDocument } from "../src/features/telegram/render/rich";
import { getCatalog } from "../src/features/telegram/render";
import { makeViewContext } from "../src/features/telegram/testing/viewFixtures";
import { richCalendarDayView, richCalendarMonthView } from "../src/features/telegram/render/views/richCalendar";
import { welcomeRichView } from "../src/features/telegram/render/views/welcome";

/**
 * Renders the real rich calendar views into a standalone HTML page styled
 * like a Telegram chat, so the card can be previewed in a browser before
 * checking it on a device. `tg-button` / `tg-button-row` are styled with CSS
 * to approximate the native rendering; callback data is replaced with "#".
 * Run: npx tsx scripts/preview-rich-calendar.ts
 */

const catalog = getCatalog("ru");
const ctx = makeViewContext({ catalog });

const task = { id: "task_1", title: "Подготовить презентацию", status: "proposed" } as Parameters<
  typeof richCalendarMonthView
>[0]["task"];

// Slots across two days of the current month (the same shape proposeSlots
// returns; times are this week so the calendar has life in it).
function slotOn(dayOffset: number, hour: number): Slot {
  const start = Date.UTC(2026, 8, 23 + dayOffset, hour);
  return { start: new Date(start).toISOString(), end: new Date(start + 60 * 60 * 1000).toISOString() };
}

const slots: Slot[] = [slotOn(1, 10), slotOn(1, 13), slotOn(4, 11)];
const view = { year: 2026, month: 9 };

function bound(doc: { html: string }): string {
  return doc.html.replace(/\{\{cb:\d+\}\}/g, "#");
}

const month = richCalendarMonthView({ task, slots }, view, ctx);
const dayNumber = 24;
const day = richCalendarDayView({ task, slots }, { ...view, day: dayNumber }, ctx);

const booked = createRichDocument();
booked.heading(task.title);
booked.line("чт, 11:00–12:00");
booked.buttonRow([{ kind: "disabled", label: "Забронировано ✓" }]);
const bookedHtml = bound(booked.build());

const welcome = welcomeRichView({ firstName: "Arttur", calendarConnected: false }, ctx);
const welcomeHtml = bound(welcome);

const telegramCss = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; background: #e7ebf0; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
  h1 { font-size: 16px; color: #707579; font-weight: 500; }
  .phone { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 18px; padding: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.12); }
  .bubble { background: #effdde; border-radius: 12px 12px 4px 12px; padding: 10px 12px; margin: 12px 0; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .bubble + .label { font-size: 12px; color: #707579; margin: 14px 0 2px 4px; }
  .bubble b { font-size: 15px; }
  .bubble, .bubble tg-button-row { line-height: 1.45; }
  tg-button-row { display: flex; gap: 4px; margin: 4px 0; }
  tg-button { flex: 1; text-align: center; font-size: 14px; padding: 8px 4px; border-radius: 8px;
    background: #f4f4f5; color: #000; cursor: default; white-space: nowrap; overflow: hidden; }
  tg-button[type="callback_data"] { background: #e8f1fb; color: #168acd; font-weight: 500; }
  tg-button[type="callback_data"][style="primary"] { background: #3390ec; color: #fff; }
  tg-button[type="callback_data"][style="success"] { background: #4fae4e; color: #fff; }
  tg-button[type="disabled"] { color: #a2acb4; background: #f4f4f5; }
  h3 { font-size: 15px; margin: 6px 0 2px; }
  p { margin: 4px 0; }
  ul { margin: 4px 0; padding-left: 18px; }
  footer { font-size: 12px; color: #707579; margin-top: 8px; }
  footer a { color: #168acd; }
  tg-slideshow img { width: 100%; border-radius: 10px; display: block; margin: 6px 0; }
  .note { font-size: 13px; color: #707579; margin-top: 16px; }
`;

const page = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Превью: Rich-календарь предложения</title>
<style>${telegramCss}</style></head>
<body>
<h1>Превью Rich-сообщения с календарём (Bot API 10.3, &lt;tg-button&gt;)</h1>
<div class="phone">
  <div class="bubble"><div class="label">0. /start — приветствие (Rich) с кнопками быстрых действий</div>
  ${welcomeHtml}</div>
  <div class="bubble"><div class="label">1. Карточка предложения — месяц с днями-кнопками</div>
  ${bound(month as unknown as { html: string })}</div>
  <div class="bubble"><div class="label">2. После нажатия на день — слоты дня кнопками</div>
  ${bound(day as unknown as { html: string })}</div>
  <div class="bubble"><div class="label">3. После выбора слота — забронировано (правка того же сообщения)</div>
  ${bookedHtml}</div>
</div>
<p class="note">Кнопки в превью стилизованы CSS под Telegram и не нажимаются: настоящий интерактив —
в @stezabot (напиши задачу текстом). Колбэки кнопок идут через тот же 64-байтный кодек v1:&lt;action&gt;:&lt;token&gt;.</p>
</body></html>`;

const outDir = join(process.cwd(), "docs", "preview");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "rich-calendar.html");
writeFileSync(out, page);
console.log(`written: ${out}`);
