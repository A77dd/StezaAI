const jwt = require('jsonwebtoken');
const cacheService = require('../services/cacheService');
const User = require('../models/User');

const isAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, error: 'Требуется авторизация' });
        }

        if (await cacheService.isBlacklisted(token)) {
            return res.status(401).json({ success: false, error: 'Токен отозван' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, error: 'Токен истёк' });
            }
            return res.status(401).json({ success: false, error: 'Недействительный токен' });
        }

        if (!decoded.telegramId || !decoded.userId) {
            await cacheService.blacklistToken(token, 7 * 24 * 60 * 60 * 1000);
            return res.status(401).json({ success: false, error: 'Устаревшая сессия' });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            await cacheService.blacklistToken(token, 7 * 24 * 60 * 60 * 1000);
            return res.status(401).json({ success: false, error: 'Пользователь не найден' });
        }

        if (user.telegram_id !== decoded.telegramId) {
            await cacheService.blacklistToken(token, 7 * 24 * 60 * 60 * 1000);
            return res.status(401).json({ success: false, error: 'Данные изменились' });
        }

        req.user = decoded;
        req.userId = decoded.userId;
        req.token = token;
        req.dbUser = user;

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

module.exports = { isAuth };