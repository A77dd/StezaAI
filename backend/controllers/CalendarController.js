const Calendar = require('../models/Calendar');

// GET /api/calendars
exports.list = async (req, res) => {
    try {
        const calendars = await Calendar.getSafeByUser(req.userId);
        res.json({ success: true, calendars });
    } catch (error) {
        console.error('List calendars error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/calendars/connect
// body: { provider, access_token, refresh_token?, expires_at? }
exports.connect = async (req, res) => {
    try {
        const { provider, access_token, refresh_token, expires_at } = req.body;

        const allowedProviders = ['google', 'yandex', 'mail', 'vk'];
        if (!provider || !allowedProviders.includes(provider)) {
            return res.status(400).json({
                success: false,
                error: 'provider должен быть: ' + allowedProviders.join(', ')
            });
        }
        if (!access_token) {
            return res.status(400).json({ success: false, error: 'access_token обязателен' });
        }

        await Calendar.upsert(req.userId, provider, {
            access_token,
            refresh_token,
            expires_at
        });

        res.json({ success: true, message: 'Календарь подключён' });
    } catch (error) {
        console.error('Connect calendar error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// DELETE /api/calendars/:provider
exports.disconnect = async (req, res) => {
    try {
        const { provider } = req.params;
        await Calendar.disconnect(req.userId, provider);
        res.json({ success: true, message: 'Календарь отключён' });
    } catch (error) {
        console.error('Disconnect calendar error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};