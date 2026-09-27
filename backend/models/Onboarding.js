// backend/models/Onboarding.js
const pool = require('../config/db');

const JSON_FIELDS = ['strengths', 'weaknesses', 'goals'];

class Onboarding {
    /**
     * Сериализует массивы/объекты в JSON-строки для MySQL.
     * Скалярные значения оставляет как есть.
     */
    static _prepare(data) {
        const prepared = {};
        for (const [key, val] of Object.entries(data)) {
            if (val === undefined) continue;

            if (JSON_FIELDS.includes(key)) {
                // null пропускаем как null, массивы/объекты сериализуем
                prepared[key] = val === null ? null : JSON.stringify(val);
            } else {
                prepared[key] = val;
            }
        }
        return prepared;
    }

    /**
     * Парсит JSON-поля при чтении из БД.
     */
    static _parse(row) {
        if (!row) return null;
        for (const key of JSON_FIELDS) {
            if (typeof row[key] === 'string') {
                try {
                    row[key] = JSON.parse(row[key]);
                } catch {
                    row[key] = null;
                }
            }
        }
        return row;
    }

    static async getByUserId(userId) {
        const [rows] = await pool.execute(
            'SELECT * FROM onboarding_profiles WHERE user_id = ?',
            [userId]
        );
        return this._parse(rows[0]) || null;
    }

    static async upsert(userId, data) {
        const prepared = this._prepare(data);
        const existing = await this.getByUserId(userId);

        if (existing) {
            const fields = [];
            const values = [];
            for (const [key, val] of Object.entries(prepared)) {
                fields.push(`${key} = ?`);
                values.push(val);
            }
            if (!fields.length) return existing;
            values.push(userId);
            await pool.execute(
                `UPDATE onboarding_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
                values
            );
            return this.getByUserId(userId);
        }

        const keys = Object.keys(prepared);
        const placeholders = keys.map(() => '?').join(', ');
        const values = [...Object.values(prepared), userId];
        await pool.execute(
            `INSERT INTO onboarding_profiles (${keys.join(', ')}, user_id)
             VALUES (${placeholders}, ?)`,
            values
        );
        return this.getByUserId(userId);
    }

    static async complete(userId) {
        await pool.execute(
            'UPDATE onboarding_profiles SET completed_at = NOW() WHERE user_id = ?',
            [userId]
        );
    }
}

module.exports = Onboarding;