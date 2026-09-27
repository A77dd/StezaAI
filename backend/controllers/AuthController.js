const jwt = require('jsonwebtoken');
const User = require('../models/User');
const cacheService = require('../services/cacheService');
const TelegramAuthService = require('../services/telegramAuthService');

// POST /api/auth/telegram
// body: { initData: string }
exports.telegramAuth = async (req, res) => {
    try {
        const { initData } = req.body;

        const { user: tgUser, error: verifyError } = TelegramAuthService.verifyInitData(initData);
        if (verifyError) {
            return res.status(401).json({ success: false, error: verifyError });
        }

        const user = await User.findOrCreate(tgUser);

        await User.updateLastLogin(user.id);

        const token = jwt.sign(
            { userId: user.id, telegramId: user.telegram_id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                photo_url: user.photo_url,
                onboarding_completed: !!user.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Telegram auth error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
    try {
        const user = req.dbUser;
        res.json({
            success: true,
            user: {
                id: user.id,
                telegram_id: user.telegram_id,
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                photo_url: user.photo_url,
                is_approved: user.is_approved,
                onboarding_completed: !!user.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
    try {
        const token = req.token;
        let ttlMs = 7 * 24 * 60 * 60 * 1000;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            ttlMs = (decoded.exp - Math.floor(Date.now() / 1000)) * 1000;
        } catch {}

        await cacheService.blacklistToken(token, ttlMs);
        res.json({ success: true, message: 'Выход выполнен' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// GET /api/auth/check
exports.checkAuth = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json({
            success: true,
            user: {
                id: req.dbUser.id,
                isApproved: req.dbUser.is_approved,
                onboarding_completed: !!req.dbUser.onboarding_completed
            }
        });
    } catch (error) {
        console.error('Check auth error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};