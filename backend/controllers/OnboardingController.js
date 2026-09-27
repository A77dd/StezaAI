const Onboarding = require('../models/Onboarding');
const User = require('../models/User');

// GET /api/onboarding
exports.getState = async (req, res) => {
    try {
        const profile = await Onboarding.getByUserId(req.userId);
        res.json({
            success: true,
            profile: profile || null,
            onboarding_completed: !!req.dbUser.onboarding_completed
        });
    } catch (error) {
        console.error('Get onboarding error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/onboarding/step
// body (любой из полей):
// { role_type?, employment_status?, strengths?, weaknesses?, goals?, agreed_to_terms? }
exports.saveStep = async (req, res) => {
    try {
        const allowed = [
            'role_type',
            'employment_status',
            'strengths',
            'weaknesses',
            'goals',
            'agreed_to_terms'
        ];

        const data = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) data[key] = req.body[key];
        }

        if (!Object.keys(data).length) {
            return res.status(400).json({ success: false, error: 'Нет данных' });
        }

        const profile = await Onboarding.upsert(req.userId, data);
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Save onboarding step error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/onboarding/complete
exports.complete = async (req, res) => {
    try {
        const profile = await Onboarding.getByUserId(req.userId);
        if (!profile || !profile.agreed_to_terms) {
            return res.status(400).json({
                success: false,
                error: 'Необходимо согласиться с правилами проекта'
            });
        }

        await Onboarding.complete(req.userId);
        await User.setOnboardingCompleted(req.userId, true);

        res.json({ success: true, message: 'Онбординг завершён' });
    } catch (error) {
        console.error('Complete onboarding error:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};