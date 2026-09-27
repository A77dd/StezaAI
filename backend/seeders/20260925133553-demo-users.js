'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const now = new Date();

        await queryInterface.bulkInsert('users', [
            {
                telegram_id: '998787032',
                username: 'Green_x1337',
                first_name: 'Глеб',
                last_name: null,
                photo_url: null,
                onboarding_completed: false,
                last_login: now,
                created_at: now,
                updated_at: now
            },
        ]);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete('users', {
            telegram_id: ['998787032']
        });
    }
};