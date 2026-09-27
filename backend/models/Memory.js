const pool = require('../config/db');

class Memory {
    static async createTable() {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS user_memory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                key_name VARCHAR(255) NOT NULL,
                value TEXT,
                confidence DECIMAL(3,2) DEFAULT 1.00,
                source VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_user_key (user_id, key_name)
            )
        `);
    }

    static async getByUser(userId) {
        const [rows] = await pool.execute(
            'SELECT key_name, value, confidence FROM user_memory WHERE user_id = ?',
            [userId]
        );
        return rows;
    }

    static async remember(userId, keyName, value, source = 'ai') {
        await pool.execute(
            `INSERT INTO user_memory (user_id, key_name, value, source)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                value = VALUES(value),
                source = VALUES(source),
                updated_at = NOW()`,
            [userId, keyName, value, source]
        );
    }

    static async forget(userId, keyName) {
        await pool.execute(
            'DELETE FROM user_memory WHERE user_id = ? AND key_name = ?',
            [userId, keyName]
        );
    }
}

module.exports = Memory;