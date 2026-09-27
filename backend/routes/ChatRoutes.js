const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/ChatController');
const { isAuth } = require('../middleware/AuthMiddleware');

router.use(isAuth);

router.get('/history', ChatController.history);
router.post('/message', ChatController.send);
router.delete('/history', ChatController.clear);

module.exports = router;