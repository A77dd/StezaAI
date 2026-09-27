const Message = require('../models/Message');
const Memory = require('../models/Memory');
const Calendar = require('../models/Calendar');

class AIService {
    static async handleMessage(userId, text, messageType = 'text') {
        await Message.add(userId, 'user', text, messageType);

        const memory = await Memory.getByUser(userId);
        const calendars = await Calendar.getByUser(userId);

        const reply = this._stubReply(text, memory, calendars);

        await Message.add(userId, 'assistant', reply);
        return reply;
    }

    static _stubReply(text, memory, calendars) {
        const lower = text.toLowerCase();

        if (lower.includes('отчет') || lower.includes('отчёт')) {
            return 'Понял задачу. Предлагаю заняться ей завтра с 15:00 до 17:00 или в четверг с 10:00 до 13:00. Подходит?';
        }
        if (lower === 'да' || lower.startsWith('да,')) {
            return 'Отлично, добавил в календарь. Напомню за 30 минут до начала.';
        }
        if (lower === 'нет' || lower.startsWith('нет,')) {
            return 'Ок, давай подберём другое время. Когда тебе удобно?';
        }
        return 'Я тебя услышал. Расскажи подробнее, что нужно сделать?';
    }
}

module.exports = AIService;