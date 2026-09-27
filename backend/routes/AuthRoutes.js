const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { isAuth } = require('../middleware/AuthMiddleware');

// Публичные
router.post('/telegram', AuthController.telegramAuth);

// Защищённые
router.get('/me', isAuth, AuthController.getMe);
router.get('/check', isAuth, AuthController.checkAuth);
router.post('/logout', isAuth, AuthController.logout);

module.exports = router;