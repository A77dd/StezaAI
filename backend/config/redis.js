// backend/config/redis.js
require('dotenv').config();

let client = null;
let connected = false;

try {
    const redis = require('redis');

    const socket = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379
    };

    const options = { socket };

    if (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.length > 0) {
        options.password = process.env.REDIS_PASSWORD;
    }

    client = redis.createClient(options);

    client.on('error', (err) => console.error('Redis error:', err.message));

    client.connect()
        .then(() => {
            connected = true;
            console.log(`✅ Redis connected (${socket.host}:${socket.port})`);
        })
        .catch(() => {
            console.log('⚠️ Redis unavailable, using in-memory cache');
        });
} catch (e) {
    console.log('⚠️ redis package not installed, using in-memory cache');
}

module.exports = {
    client,
    isConnected: () => connected
};