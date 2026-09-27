const pool = require('../config/db');

class User {
    static async createTable() {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                telegram_id VARCHAR(100) UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                photo_url TEXT,
                onboarding_completed BOOLEAN DEFAULT FALSE,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_telegram_id (telegram_id)
            )
        `);
    }

    static async findById(id) {
        const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    }

    static async findByTelegramId(telegramId) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId]
        );
        return rows[0] || null;
    }

    static async create(tgUser) {
        const [result] = await pool.execute(
            `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url)
             VALUES (?, ?, ?, ?, ?)`,
            [
                tgUser.id,
                tgUser.username || null,
                tgUser.first_name || null,
                tgUser.last_name || null,
                tgUser.photo_url || null
            ]
        );
        return this.findById(result.insertId);
    }

    static async findOrCreate(tgUser) {
        const user = await this.findByTelegramId(tgUser.id);

        if (user) {
            // Обновляем поля, которые могли измениться в Telegram
            await pool.execute(
                `UPDATE users
                SET username = ?, first_name = ?, last_name = ?, photo_url = ?
                WHERE id = ?`,
                [
                    tgUser.username || null,
                    tgUser.first_name || null,
                    tgUser.last_name || null,
                    tgUser.photo_url || null,
                    user.id
                ]
            );
            return this.findById(user.id);
        }

        return this.create(tgUser);
    }

    static async updateLastLogin(id) {
        await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);
    }

    static async updateProfile(id, data) {
        const fields = [];
        const values = [];
        for (const [key, val] of Object.entries(data)) {
            fields.push(`${key} = ?`);
            values.push(val);
        }
        if (!fields.length) return this.findById(id);
        values.push(id);
        await pool.execute(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.findById(id);
    }

    static async setOnboardingCompleted(id, completed = true) {
        await pool.execute(
            'UPDATE users SET onboarding_completed = ? WHERE id = ?',
            [completed, id]
        );
    }

    static async delete(id) {
        await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    }

    static async getAll(limit = 100) {
        const [rows] = await pool.execute(
            'SELECT id, telegram_id, username, first_name, last_name, photo_url, onboarding_completed, last_login, created_at FROM users ORDER BY created_at DESC LIMIT ?',
            [limit]
        );
        return rows;
    }
}

module.exports = User;