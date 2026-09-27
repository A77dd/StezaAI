const Task = require('../models/Task');

// GET /api/tasks?status=pending|in_progress|completed|cancelled
exports.list = async (req, res) => {
    try {
        const status = req.query.status || null;
        const tasks = await Task.getByUser(req.userId, status);
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('List tasks error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/tasks
// body: { title, description?, estimated_hours?, deadline? }
exports.create = async (req, res) => {
    try {
        const { title, description, estimated_hours, deadline } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'title обязателен' });
        }

        const task = await Task.create(req.userId, {
            title: title.trim(),
            description,
            estimated_hours,
            deadline
        });

        res.json({ success: true, task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// PATCH /api/tasks/:id
exports.update = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task || task.user_id !== req.userId) {
            return res.status(404).json({ success: false, error: 'Задача не найдена' });
        }

        const allowed = [
            'title',
            'description',
            'estimated_hours',
            'status',
            'deadline',
            'scheduled_start',
            'scheduled_end',
            'calendar_event_id',
            'calendar_provider'
        ];
        const data = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) data[key] = req.body[key];
        }

        const updated = await Task.update(req.params.id, data);
        res.json({ success: true, task: updated });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// DELETE /api/tasks/:id
exports.remove = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task || task.user_id !== req.userId) {
            return res.status(404).json({ success: false, error: 'Задача не найдена' });
        }

        await Task.delete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};