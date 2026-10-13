import { PlanningSettings } from './components/PlanningSettings';
import { AccountData } from './components/AccountData';
import { usePlanningTimezone } from '@/app/hooks/usePlanningTimezone';
import { dayKey, shiftDay } from '@/shared/library/planningTime';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from '@/app/routes/paths';
import { listTasks, type Task } from '@/shared/api/steza';
import './ProfilePage.css';
import { ProfileMemory } from './components/ProfileMemory';

type Freedom = 'confirm' | 'minimal' | 'full';
interface Preferences {
    address: 'informal' | 'formal';
    freedom: Freedom;
    about: string;
}
const DEFAULT_PREFERENCES: Preferences = { address: 'informal', freedom: 'confirm', about: '' };
const FREEDOM_OPTIONS: { id: Freedom; title: string; description: string }[] = [
    {
        id: 'confirm',
        title: 'Только с подтверждением',
        description: 'Сначала предложить действие и дождаться решения.',
    },
    {
        id: 'minimal',
        title: 'Минимальные подтверждения',
        description: 'Рутинные шаги — самостоятельно, важные решения — вместе.',
    },
    {
        id: 'full',
        title: 'Полный доступ',
        description: 'Действовать самостоятельно в рамках поставленных задач.',
    },
];
const readPreferences = (key: string): Preferences => {
    try {
        const data = JSON.parse(localStorage.getItem(key) ?? '{}');
        return {
            address: data?.address === 'formal' ? 'formal' : 'informal',
            freedom: FREEDOM_OPTIONS.some((option) => option.id === data?.freedom)
                ? data.freedom
                : 'confirm',
            about: typeof data?.about === 'string' ? data.about.slice(0, 1000) : '',
        };
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
};

const getMetrics = (tasks: Task[], now: Date, timezone: string) => {
    const relevant = tasks.filter((task) =>
        ['inbox', 'proposed', 'scheduled', 'done'].includes(task.status),
    );
    const done = relevant.filter((task) => task.status === 'done').length;
    const active = relevant.filter((task) => task.status !== 'done');
    const today = dayKey(now, timezone);
    const days = Array.from({ length: 7 }, (_, index) => {
        const key = shiftDay(today, index);
        const date = new Date(`${key}T12:00:00Z`);
        const count = active.filter(
            (task) => task.deadline && dayKey(new Date(task.deadline), timezone) === key,
        ).length;
        return { date, count };
    });
    return {
        total: relevant.length,
        done,
        active: active.length,
        percent: relevant.length ? Math.round((done / relevant.length) * 100) : 0,
        overdue: active.filter((task) => task.deadline && Date.parse(task.deadline) < now.getTime())
            .length,
        days,
        max: Math.max(1, ...days.map((day) => day.count)),
    };
};

export const ProfilePage = () => {
    const { user } = useAuth();
    const { timezone: savedTimezone } = usePlanningTimezone();
    const timezone = savedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const navigate = useNavigate();
    const { hash } = useLocation();
    const storageKey = `steza:profile-preferences:${user?.id ?? 'guest'}`;
    const [preferences, setPreferences] = useState<Preferences>(() => readPreferences(storageKey));
    const [notice, setNotice] = useState('');
    const [saveError, setSaveError] = useState('');
    const [aboutOpen, setAboutOpen] = useState(hash === '#memory');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        setPreferences(readPreferences(storageKey));
        setNotice('');
        setSaveError('');
        setAboutOpen(hash === '#memory');
    }, [storageKey, hash]);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);
        setTasks([]);
        if (!user) {
            setLoading(false);
            return () => controller.abort();
        }
        listTasks(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setTasks(data);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [user?.id, retry]);

    const savePreferences = (change: Partial<Preferences>) => {
        const next = { ...preferences, ...change };
        setSaveError('');
        setNotice('');
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
            setPreferences(next);
            setNotice('Предпочтения сохранены на этом устройстве.');
            return true;
        } catch {
            setSaveError(
                'Не удалось сохранить. Проверь доступ к хранилищу браузера и попробуй ещё раз.',
            );
            return false;
        }
    };
    const metrics = getMetrics(tasks, now, timezone);
    const formal = preferences.address === 'formal';
    const freedom = FREEDOM_OPTIONS.find((option) => option.id === preferences.freedom)!;

    if (!user)
        return (
            <div className="profile-page">
                <p>Нет данных пользователя.</p>
            </div>
        );

    return (
        <div className="profile-page">
            <section
                className="profile-panel profile-efficiency"
                aria-labelledby="profile-efficiency-title"
                aria-busy={loading}
            >
                <div className="profile-heading">
                    <div>
                        <p className="profile-eyebrow">ШАГ ЗА ШАГОМ</p>
                        <h1 id="profile-efficiency-title">Моя эффективность</h1>
                    </div>
                    <span className="profile-spark" aria-hidden="true">
                        ✦
                    </span>
                </div>
                {loading ? (
                    <p className="profile-state" role="status">
                        Собираем статистику…
                    </p>
                ) : error ? (
                    <div className="profile-state" role="alert">
                        <p>Не удалось загрузить статистику.</p>
                        <button
                            className="profile-text-button"
                            onClick={() => setRetry((value) => value + 1)}
                        >
                            Попробовать ещё раз ↗
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="profile-efficiency__summary">
                            <div
                                className="profile-progress"
                                role="img"
                                aria-label={`Выполнено ${metrics.done} из ${metrics.total} задач`}
                            >
                                <svg viewBox="0 0 120 120" aria-hidden="true">
                                    <circle
                                        className="profile-progress__track"
                                        cx="60"
                                        cy="60"
                                        r="51"
                                    />
                                    <circle
                                        className="profile-progress__fill"
                                        cx="60"
                                        cy="60"
                                        r="51"
                                        pathLength="100"
                                        strokeDasharray={`${metrics.percent} 100`}
                                        transform="rotate(-90 60 60)"
                                    />
                                </svg>
                                <div>
                                    <strong>{metrics.total ? `${metrics.percent}%` : '—'}</strong>
                                    <span>{metrics.total ? 'выполнено' : 'пока нет задач'}</span>
                                </div>
                            </div>
                            <div className="profile-metrics">
                                <div>
                                    <strong>
                                        {metrics.done}
                                        <span> / {metrics.total}</span>
                                    </strong>
                                    <p>задач завершено</p>
                                </div>
                                <div>
                                    <strong>{metrics.active}</strong>
                                    <p>осталось в планах</p>
                                </div>
                            </div>
                        </div>
                        <p className="profile-footnote">
                            Доля выполненных задач за всё время. Отменённые не учитываются.
                        </p>
                        <div className="profile-load-heading">
                            <h2>Загрузка на 7 дней</h2>
                            <span>по срокам задач</span>
                        </div>
                        <div className="profile-week">
                            {metrics.days.map((day, index) => (
                                <div
                                    className={`profile-week__day${index === 0 ? ' profile-week__day--today' : ''}`}
                                    key={day.date.getTime()}
                                    aria-label={`${day.date.toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' })}: ${day.count} задач`}
                                >
                                    <span className="profile-week__count">{day.count}</span>
                                    <div className="profile-week__track">
                                        <span
                                            style={{
                                                height: `${(day.count / metrics.max) * 100}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="profile-week__label">
                                        {index === 0
                                            ? 'Сегодня'
                                            : day.date.toLocaleDateString('ru-RU', {
                                                  timeZone: 'UTC',
                                                  weekday: 'short',
                                              })}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {metrics.overdue > 0 && (
                            <button
                                className="profile-overdue"
                                onClick={() => navigate(PATHS.TASKS)}
                            >
                                Срок прошёл: {metrics.overdue} · Открыть задачи ↗
                            </button>
                        )}
                        {metrics.total === 0 && (
                            <button
                                className="profile-text-button"
                                onClick={() => navigate(PATHS.CHAT)}
                            >
                                {formal ? 'Добавьте' : 'Добавь'} первую задачу ↗
                            </button>
                        )}
                    </>
                )}
            </section>

            <div className="profile-split">
                <section
                    className="profile-panel profile-benefit"
                    aria-labelledby="profile-benefit-title"
                >
                    <span className="profile-card-icon" aria-hidden="true">
                        ✧
                    </span>
                    <p className="profile-eyebrow">ВМЕСТЕ СО STEZA</p>
                    <h2 id="profile-benefit-title">Как помогает Steza</h2>
                    <p>Меньше держать в голове, больше внимания важному.</p>
                    <div className="profile-benefit__value">
                        <strong>—</strong>
                        <span>время сэкономлено</span>
                    </div>
                    <p className="profile-footnote">
                        Оценка появится, когда будет доступен учёт помощи Steza.
                    </p>
                </section>
                <section
                    className="profile-panel profile-about"
                    aria-labelledby="profile-about-title"
                >
                    <span className="profile-card-icon" aria-hidden="true">
                        ↗
                    </span>
                    <p className="profile-eyebrow">БОЛЬШЕ КОНТЕКСТА</p>
                    <h2 id="profile-about-title">{formal ? 'Расскажите' : 'Расскажи'} о себе</h2>
                    <p>
                        Цели, опыт и привычки — всё, что помогает лучше понимать{' '}
                        {formal ? 'вас' : 'тебя'}.
                    </p>
                    <button
                        className="profile-about__primary"
                        aria-expanded={aboutOpen}
                        aria-controls="profile-about-form"
                        onClick={() => {
                            setAboutOpen((value) => !value);
                        }}
                    >
                        {'О себе'} <span aria-hidden="true">↗</span>
                    </button>
                    <button
                        className="profile-about__link"
                        onClick={() => navigate(`${PATHS.HOME}#calendars`)}
                    >
                        Календари <span aria-hidden="true">+</span>
                    </button>
                    <button
                        className="profile-about__link"
                        onClick={() => navigate(`${PATHS.HOME}#resumes`)}
                    >
                        Резюме <span aria-hidden="true">+</span>
                    </button>
                </section>
            </div>
            {aboutOpen && (
                <div id="profile-about-form">
                    <ProfileMemory />
                </div>
            )}
            <PlanningSettings />

            <section
                className="profile-panel profile-address"
                aria-labelledby="profile-address-title"
            >
                <div>
                    <h2 id="profile-address-title">Как к {formal ? 'вам' : 'тебе'} обращаться</h2>
                    <p>{formal ? 'Вежливо и по делу' : 'Просто и по-дружески'}</p>
                </div>
                <div className="profile-address__choices" role="group" aria-label="Форма обращения">
                    <button
                        aria-pressed={!formal}
                        onClick={() => savePreferences({ address: 'informal' })}
                    >
                        Ты
                    </button>
                    <button
                        aria-pressed={formal}
                        onClick={() => savePreferences({ address: 'formal' })}
                    >
                        Вы
                    </button>
                </div>
            </section>

            <section
                className="profile-panel profile-freedom"
                aria-labelledby="profile-freedom-title"
            >
                <details>
                    <summary>
                        <span>
                            <h2 id="profile-freedom-title">Степень свободы</h2>
                            <span className="profile-freedom__current">{freedom.title}</span>
                        </span>
                        <span className="profile-freedom__chevron" aria-hidden="true">
                            ⌄
                        </span>
                    </summary>
                    <fieldset>
                        <legend className="profile-visually-hidden">
                            Выбрать степень свободы Steza
                        </legend>
                        {FREEDOM_OPTIONS.map((option) => (
                            <label className="profile-freedom__option" key={option.id}>
                                <input
                                    type="radio"
                                    name="steza-freedom"
                                    value={option.id}
                                    checked={preferences.freedom === option.id}
                                    onChange={() => savePreferences({ freedom: option.id })}
                                />
                                <span>
                                    <strong>{option.title}</strong>
                                    <small>{option.description}</small>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                </details>
                <p className="profile-footnote">
                    Сохраняется как предпочтение. Автономные действия Steza пока недоступны.
                </p>
            </section>
            <p className="profile-settings-notice" role="status">
                {notice ||
                    'Обращение и предпочтения сохраняются на этом устройстве. Настройка обращения пока применяется только в профиле.'}
            </p>
            {saveError && (
                <p className="profile-settings-error" role="alert">
                    {saveError}
                </p>
            )}
            <AccountData />
        </div>
    );
};
