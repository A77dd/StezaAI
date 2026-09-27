// backend/services/cacheService.js
const { client, isConnected } = require('../config/redis');

class CacheService {
    constructor() {
        this.memory = new Map();
        this.defaultTTL = 5 * 60 * 1000;
    }

    async get(key) {
        if (isConnected() && client) {
            try {
                const val = await client.get(key);
                return val ? JSON.parse(val) : null;
            } catch (e) {
                console.error('Redis get error:', e.message);
            }
        }

        const cached = this.memory.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.memory.delete(key);
            return null;
        }
        return cached.data;
    }

    async set(key, value, ttlMs = null) {
        const ttl = ttlMs || this.defaultTTL;
        if (isConnected() && client) {
            try {
                await client.set(key, JSON.stringify(value), { PX: ttl });
                return;
            } catch (e) {
                console.error('Redis set error:', e.message);
            }
        }
        this.memory.set(key, { data: value, timestamp: Date.now(), ttl });
    }

    async delete(key) {
        if (isConnected() && client) {
            try { await client.del(key); } catch (e) {}
        }
        this.memory.delete(key);
    }

    async blacklistToken(token, ttlMs) {
        await this.set(`blacklist:${token}`, true, ttlMs);
    }

    async isBlacklisted(token) {
        return (await this.get(`blacklist:${token}`)) !== null;
    }
}

module.exports = new CacheService();