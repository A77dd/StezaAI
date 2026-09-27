const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { isAuth } = require('../middleware/AuthMiddleware');

router.use(isAuth);

// Список пользователей (пока без ограничений — решим позже)
router.get('/', UserController.list);

// Удалить пользователя
router.delete('/:userId', UserController.remove);

module.exports = router;