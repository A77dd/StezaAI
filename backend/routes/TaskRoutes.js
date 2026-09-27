const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/TaskController');
const { isAuth } = require('../middleware/AuthMiddleware');

router.use(isAuth);

router.get('/', TaskController.list);
router.post('/', TaskController.create);
router.patch('/:id', TaskController.update);
router.delete('/:id', TaskController.remove);

module.exports = router;