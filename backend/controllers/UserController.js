const User = require('../models/User');

// GET /api/users
exports.list = async (req, res) => {
    try {
        const users = await User.getAll(100);
        res.json({ success: true, users });
    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// DELETE /api/users/:userId
exports.remove = async (req, res) => {
    try {
        const { userId } = req.params;

        if (parseInt(userId, 10) === req.userId) {
            return res.status(403).json({ success: false, error: 'Нельзя удалить себя' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        await User.delete(userId);
        res.json({ success: true, message: 'Пользователь удалён' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};