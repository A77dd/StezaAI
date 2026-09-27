const express = require('express');
const router = express.Router();
const CalendarController = require('../controllers/CalendarController');
const { isAuth } = require('../middleware/AuthMiddleware');

router.use(isAuth);

router.get('/', CalendarController.list);
router.post('/connect', CalendarController.connect);
router.delete('/:provider', CalendarController.disconnect);

module.exports = router;