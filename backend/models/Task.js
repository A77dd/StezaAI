const pool = require('../config/db');

class Task {
    static async createTable() {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                estimated_hours DECIMAL(5,2),
                status ENUM('pending', 'in_progress', 'completed', 'cancelled')
                    DEFAULT 'pending',
                deadline TIMESTAMP NULL,
                scheduled_start TIMESTAMP NULL,
                scheduled_end TIMESTAMP NULL,
                calendar_event_id VARCHAR(255),
                calendar_provider VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_status (user_id, status)
            )
        `);
    }

    static async create(userId, data) {
        const [result] = await pool.execute(
            `INSERT INTO tasks
                (user_id, title, description, estimated_hours, deadline,
                 scheduled_start, scheduled_end)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                data.title,
                data.description || null,
                data.estimated_hours || null,
                data.deadline || null,
                data.scheduled_start || null,
                data.scheduled_end || null
            ]
        );
        return this.findById(result.insertId);
    }

    static async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM tasks WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async getByUser(userId, status = null) {
        let query = 'SELECT * FROM tasks WHERE user_id = ?';
        const params = [userId];
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        query += ' ORDER BY created_at DESC';
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    static async update(id, data) {
        const fields = [];
        const values = [];
        for (const [key, val] of Object.entries(data)) {
            fields.push(`${key} = ?`);
            values.push(val);
        }
        if (!fields.length) return this.findById(id);
        values.push(id);
        await pool.execute(
            `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    }

    static async delete(id) {
        await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);
    }
}

module.exports = Task;