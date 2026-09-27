const express = require('express');
const router = express.Router();
const OnboardingController = require('../controllers/OnboardingController');
const { isAuth } = require('../middleware/AuthMiddleware');

router.use(isAuth);

// Текущее состояние онбординга
router.get('/', OnboardingController.getState);

// Сохранить шаг онбординга
router.post('/step', OnboardingController.saveStep);

// Завершить онбординг
router.post('/complete', OnboardingController.complete);

module.exports = router;