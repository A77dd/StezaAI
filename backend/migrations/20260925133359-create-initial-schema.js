'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // =========================
        // users
        // =========================
        await queryInterface.createTable('users', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            telegram_id: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true
            },
            username: Sequelize.STRING(255),
            first_name: Sequelize.STRING(255),
            last_name: Sequelize.STRING(255),
            photo_url: Sequelize.TEXT,
            onboarding_completed: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            last_login: Sequelize.DATE,
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });
        await queryInterface.addIndex('users', ['telegram_id'], {
            name: 'idx_users_telegram_id'
        });

        // =========================
        // onboarding_profiles
        // =========================
        await queryInterface.createTable('onboarding_profiles', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                unique: true,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            role_type: Sequelize.STRING(100),
            employment_status: Sequelize.STRING(50),
            strengths: Sequelize.JSON,
            weaknesses: Sequelize.JSON,
            goals: Sequelize.JSON,
            agreed_to_terms: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            completed_at: Sequelize.DATE,
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // =========================
        // tasks
        // =========================
        await queryInterface.createTable('tasks', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            title: {
                type: Sequelize.STRING(500),
                allowNull: false
            },
            description: Sequelize.TEXT,
            estimated_hours: Sequelize.DECIMAL(5, 2),
            status: {
                type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
                defaultValue: 'pending'
            },
            deadline: Sequelize.DATE,
            scheduled_start: Sequelize.DATE,
            scheduled_end: Sequelize.DATE,
            calendar_event_id: Sequelize.STRING(255),
            calendar_provider: Sequelize.STRING(50),
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });
        await queryInterface.addIndex('tasks', ['user_id', 'status'], {
            name: 'idx_tasks_user_status'
        });

        // =========================
        // user_calendars
        // =========================
        await queryInterface.createTable('user_calendars', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            provider: {
                type: Sequelize.ENUM('google', 'yandex', 'mail', 'vk'),
                allowNull: false
            },
            access_token: Sequelize.TEXT,
            refresh_token: Sequelize.TEXT,
            expires_at: Sequelize.DATE,
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
        await queryInterface.addIndex('user_calendars', ['user_id', 'provider'], {
            name: 'uq_user_calendars_user_provider',
            unique: true
        });

        // =========================
        // user_memory
        // =========================
        await queryInterface.createTable('user_memory', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            key_name: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            value: Sequelize.TEXT,
            confidence: {
                type: Sequelize.DECIMAL(3, 2),
                defaultValue: 1.00
            },
            source: Sequelize.STRING(50),
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });
        await queryInterface.addIndex('user_memory', ['user_id', 'key_name'], {
            name: 'uq_user_memory_user_key',
            unique: true
        });

        // =========================
        // messages
        // =========================
        await queryInterface.createTable('messages', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            role: {
                type: Sequelize.ENUM('user', 'assistant', 'system'),
                allowNull: false
            },
            content: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            message_type: {
                type: Sequelize.ENUM('text', 'voice'),
                defaultValue: 'text'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });
        await queryInterface.addIndex('messages', ['user_id', 'created_at'], {
            name: 'idx_messages_user_created'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('messages');
        await queryInterface.dropTable('user_memory');
        await queryInterface.dropTable('user_calendars');
        await queryInterface.dropTable('tasks');
        await queryInterface.dropTable('onboarding_profiles');
        await queryInterface.dropTable('users');
    }
};