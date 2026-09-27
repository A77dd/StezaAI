// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Routes
const AuthRoutes = require('./routes/AuthRoutes');
const OnboardingRoutes = require('./routes/OnboardingRoutes');
const UserRoutes = require('./routes/UserRoutes');
const TaskRoutes = require('./routes/TaskRoutes');
const CalendarRoutes = require('./routes/CalendarRoutes');
const ChatRoutes = require('./routes/ChatRoutes');

// Middleware
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// === Важно за cloudpub / любым прокси ===
// Чтобы req.protocol и Origin читались правильно
app.set('trust proxy', 1);

// === CORS ===
const isAllowedOrigin = (origin) => {
    if (!origin) return true;                              
    if (origin.startsWith('http://localhost')) return true;
    if (origin.startsWith('http://127.0.0.1')) return true;
    if (origin.endsWith('.cloudpub.ru')) return true;     
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        console.log('CORS blocked:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// === Body parsers ===
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// === Health ===
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// === API ===
app.use('/api/auth', AuthRoutes);
app.use('/api/onboarding', OnboardingRoutes);
app.use('/api/users', UserRoutes);
app.use('/api/tasks', TaskRoutes);
app.use('/api/calendars', CalendarRoutes);
app.use('/api/chat', ChatRoutes);

// === 404 + errors — строго последними ===
app.use(notFound);
app.use(errorHandler);

// === Старт ===
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 StezaAI backend running on port ${PORT}`);
    console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`🔐 JWT expires in: ${process.env.JWT_EXPIRES_IN}`);
    console.log(`✅ CORS: localhost + *.cloudpub.ru`);
});