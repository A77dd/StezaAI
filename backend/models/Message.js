const pool = require('../config/db');

class Message {
    static async createTable() {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                role ENUM('user', 'assistant', 'system') NOT NULL,
                content TEXT NOT NULL,
                message_type ENUM('text', 'voice') DEFAULT 'text',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_created (user_id, created_at)
            )
        `);
    }

    static async add(userId, role, content, messageType = 'text') {
        const [result] = await pool.execute(
            `INSERT INTO messages (user_id, role, content, message_type)
             VALUES (?, ?, ?, ?)`,
            [userId, role, content, messageType]
        );
        return result.insertId;
    }

    static async getHistory(userId, limit = 50) {
        const [rows] = await pool.execute(
            `SELECT * FROM messages
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [userId, limit]
        );
        return rows.reverse();
    }

    static async clearHistory(userId) {
        await pool.execute('DELETE FROM messages WHERE user_id = ?', [userId]);
    }
}

module.exports = Message;