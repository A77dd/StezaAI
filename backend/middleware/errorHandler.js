const notFound = (req, res) => {
    res.status(404).json({ success: false, error: 'Маршрут не найден' });
};

const errorHandler = (err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Внутренняя ошибка сервера'
    });
};

module.exports = { notFound, errorHandler };