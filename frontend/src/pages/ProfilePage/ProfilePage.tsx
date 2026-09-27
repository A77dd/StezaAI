// src/pages/ProfilePage/ProfilePage.tsx
import { useAuth } from '@/app/hooks/useAuth';
import { hapticImpact } from '@/shared/library/telegram';
import './ProfilePage.css';

export const ProfilePage = () => {
    const { user, logout } = useAuth();

    const handleLogout = async () => {
        hapticImpact('medium');
        await logout();
    };

    if (!user) {
        return (
            <div className="profile-page">
                <p className="profile-page__empty">Нет данных пользователя</p>
            </div>
        );
    }

    const fullName =
        [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени';

    // TODO: заменить на реальные данные с бэка
    const efficiency = {
        percent: 78,
        tasksDone: 12,
        tasksPlanned: 15,
        focusHours: 18
    };

    const weekActivity = [
        { day: 'Пн', value: 3 },
        { day: 'Вт', value: 5 },
        { day: 'Ср', value: 2 },
        { day: 'Чт', value: 4 },
        { day: 'Пт', value: 6 },
        { day: 'Сб', value: 3 },
        { day: 'Вс', value: 1 }
    ];

    const maxActivity = Math.max(...weekActivity.map((d) => d.value));

    const loadToday = { planned: 5, done: 3 };
    const loadWeek = { planned: 30, done: 12 };

    // TODO: заменить на реальные задачи с бэка
    const tasks = [
        { id: 1, title: 'Подготовить отчёт', done: false },
        { id: 2, title: 'Созвон с командой', done: true },
        { id: 3, title: 'Обновить документацию', done: false }
    ];

    const handleAddTask = () => {
        hapticImpact('medium');
        // TODO: navigate to task creation
    };

    const handleTaskClick = (id: number) => {
        hapticImpact('light');
        // TODO: navigate to task detail
    };

    return (
        <div className="profile-page">
            {/* === Профиль === */}
            {/* <div className="profile-page__card">
                <div className="profile-page__avatar">
                    {user.photo_url ? (
                        <img
                            src={user.photo_url}
                            alt={fullName}
                            className="profile-page__avatar-img"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <span className="profile-page__avatar-letter">
                            {(user.first_name ?? '?')[0].toUpperCase()}
                        </span>
                    )}
                </div>
                <h2 className="profile-page__name">{fullName}</h2>
                {user.username && (
                    <p className="profile-page__username">@{user.username}</p>
                )}
            </div> */}

            {/* === Эффективность === */}
            <section className="profile-page__section">
                <h3 className="profile-page__section-title">Эффективность</h3>

                <div className="efficiency-card">
                    <div className="efficiency-card__top">
                        <div className="efficiency-card__ring">
                            <svg viewBox="0 0 120 120" className="efficiency-card__svg">
                                <circle
                                    cx="60" cy="60" r="52"
                                    fill="none"
                                    stroke="var(--surface)"
                                    strokeWidth="10"
                                />
                                <circle
                                    cx="60" cy="60" r="52"
                                    fill="none"
                                    stroke="var(--primary)"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(efficiency.percent / 100) * 327} 327`}
                                    transform="rotate(-90 60 60)"
                                />
                            </svg>
                            <div className="efficiency-card__score">
                                <span className="efficiency-card__score-value">
                                    {efficiency.percent}%
                                </span>
                                <span className="efficiency-card__score-label">
                                    эффективность
                                </span>
                            </div>
                        </div>

                        <div className="efficiency-card__metrics">
                            <div className="efficiency-metric">
                                <span className="efficiency-metric__icon">✅</span>
                                <div className="efficiency-metric__content">
                                    <span className="efficiency-metric__value">
                                        {efficiency.tasksDone}/{efficiency.tasksPlanned}
                                    </span>
                                    <span className="efficiency-metric__label">
                                        задач закрыто
                                    </span>
                                </div>
                            </div>

                            <div className="efficiency-metric">
                                <span className="efficiency-metric__icon">⚡</span>
                                <div className="efficiency-metric__content">
                                    <span className="efficiency-metric__value">
                                        {efficiency.focusHours}ч
                                    </span>
                                    <span className="efficiency-metric__label">
                                        в фокусе
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* График за неделю */}
                    <div className="efficiency-card__chart">
                        {weekActivity.map((d) => (
                            <div key={d.day} className="efficiency-chart-bar">
                                <div
                                    className="efficiency-chart-bar__fill"
                                    style={{ height: `${(d.value / maxActivity) * 100}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="efficiency-card__chart-labels">
                        {weekActivity.map((d) => (
                            <span key={d.day}>{d.day}</span>
                        ))}
                    </div>
                </div>
            </section>

            {/* === Загрузка === */}
            <section className="profile-page__section">
                <h3 className="profile-page__section-title">Загрузка</h3>

                <div className="load-card">
                    <div className="load-card__item">
                        <div className="load-card__head">
                            <span className="load-card__label">Сегодня</span>
                            <span className="load-card__value">
                                {loadToday.done}/{loadToday.planned}
                            </span>
                        </div>
                        <div className="load-card__bar">
                            <div
                                className="load-card__fill"
                                style={{
                                    width: `${(loadToday.done / loadToday.planned) * 100}%`
                                }}
                            />
                        </div>
                    </div>

                    <div className="load-card__item">
                        <div className="load-card__head">
                            <span className="load-card__label">На неделю</span>
                            <span className="load-card__value">
                                {loadWeek.done}/{loadWeek.planned}
                            </span>
                        </div>
                        <div className="load-card__bar">
                            <div
                                className="load-card__fill"
                                style={{
                                    width: `${(loadWeek.done / loadWeek.planned) * 100}%`
                                }}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* === Задачи === */}
            <section className="profile-page__section">
                <div className="profile-page__section-header">
                    <h3 className="profile-page__section-title">Задачи</h3>
                </div>

                <div className="tasks-card">
                    {/* Кнопка «Добавить задачу» */}
                    <button
                        type="button"
                        className="tasks-card__add"
                        onClick={handleAddTask}
                    >
                        <span className="tasks-card__add-icon">+</span>
                        <span className="tasks-card__add-text">Добавить задачу</span>
                    </button>

                    {/* Список задач */}
                    {tasks.length > 0 && (
                        <div className="tasks-card__list">
                            {tasks.slice(0, 3).map((task) => (
                                <button
                                    key={task.id}
                                    type="button"
                                    className={`task-mini ${
                                        task.done ? 'task-mini--done' : ''
                                    }`}
                                    onClick={() => handleTaskClick(task.id)}
                                >
                                    <span className="task-mini__check">
                                        {task.done ? '✓' : ''}
                                    </span>
                                    <span className="task-mini__title">
                                        {task.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {tasks.length === 0 && (
                        <p className="tasks-card__empty">
                            Пока пусто. Добавь первую задачу.
                        </p>
                    )}
                </div>
            </section>

            {/* === Выход === */}
            {/* <button
                type="button"
                className="profile-page__logout"
                onClick={handleLogout}
            >
                Выйти
            </button> */}
        </div>
    );
};