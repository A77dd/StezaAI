const pool = require('../config/db');

class Calendar {
    static async createTable() {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS user_calendars (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                provider ENUM('google', 'yandex', 'mail', 'vk') NOT NULL,
                access_token TEXT,
                refresh_token TEXT,
                expires_at TIMESTAMP NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_user_provider (user_id, provider)
            )
        `);
    }

    static async getByUser(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM user_calendars WHERE user_id = ? AND is_active = TRUE',
            [userId]
        );
        return rows;
    }

    static async getSafeByUser(userId) {
        const [rows] = await pool.execute(
            `SELECT id, provider, is_active, expires_at
             FROM user_calendars
             WHERE user_id = ? AND is_active = TRUE`,
            [userId]
        );
        return rows;
    }

    static async upsert(userId, provider, tokens) {
        await pool.execute(
            `INSERT INTO user_calendars
                (user_id, provider, access_token, refresh_token, expires_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                access_token = VALUES(access_token),
                refresh_token = VALUES(refresh_token),
                expires_at = VALUES(expires_at),
                is_active = TRUE`,
            [
                userId,
                provider,
                tokens.access_token,
                tokens.refresh_token || null,
                tokens.expires_at || null
            ]
        );
    }

    static async disconnect(userId, provider) {
        await pool.execute(
            'UPDATE user_calendars SET is_active = FALSE WHERE user_id = ? AND provider = ?',
            [userId, provider]
        );
    }
}

module.exports = Calendar;