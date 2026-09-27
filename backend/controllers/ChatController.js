const AIService = require('../services/aiService');
const Message = require('../models/Message');

// GET /api/chat/history?limit=50
exports.history = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const messages = await Message.getHistory(req.userId, limit);
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Chat history error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/chat/message
// body: { text, messageType? }  messageType: 'text' | 'voice'
exports.send = async (req, res) => {
    try {
        const { text, messageType } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'text обязателен' });
        }

        const type = messageType === 'voice' ? 'voice' : 'text';
        const reply = await AIService.handleMessage(req.userId, text.trim(), type);

        res.json({ success: true, reply });
    } catch (error) {
        console.error('Chat send error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// DELETE /api/chat/history
exports.clear = async (req, res) => {
    try {
        await Message.clearHistory(req.userId);
        res.json({ success: true, message: 'История очищена' });
    } catch (error) {
        console.error('Clear chat error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};