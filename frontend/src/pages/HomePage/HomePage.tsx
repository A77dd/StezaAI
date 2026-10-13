import { usePlanningTimezone } from '@/app/hooks/usePlanningTimezone';
import { dayKey, shiftDay } from '@/shared/library/planningTime';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from '@/app/routes/paths';
import { apiError } from '@/shared/api/client';
import {
    listTasks,
    isActive,
    completeTask as finishTask,
    compareTasks,
    type Task,
} from '@/shared/api/steza';
import './HomePage.css';
import { NextAction } from './components/NextAction';

const CALENDARS = [
    { id: 'google', name: 'Google', mark: 'G' },
    { id: 'apple', name: 'Apple', mark: 'A' },
    { id: 'mail', name: 'Mail.ru', mark: '@' },
    { id: 'yandex', name: 'Яндекс', mark: 'Я' },
];
const SERVICES = [
    { id: 'hh', name: 'hh.ru', host: 'hh.ru', mark: 'hh' },
    { id: 'linkedin', name: 'LinkedIn', host: 'linkedin.com', mark: 'in' },
    { id: 'habr', name: 'Хабр Карьера', host: 'career.habr.com', mark: 'H' },
    { id: 'superjob', name: 'SuperJob', host: 'superjob.ru', mark: 'SJ' },
    { id: 'rabota', name: 'Работа.ру', host: 'rabota.ru', mark: 'Р' },
];
const BANNERS = [
    {
        label: 'МЕНЬШЕ СУЕТЫ · БОЛЬШЕ ФОКУСА',
        title: 'Важное — на первом плане',
        text: 'Собери задачи и планы в одном месте. Начни с одного небольшого шага.',
        action: 'Обсудить планы',
        target: 'chat',
    },
    {
        label: 'ТВОЙ ДЕНЬ В ОДНОМ МЕСТЕ',
        title: 'Освободи время для себя',
        text: 'Календари помогут учитывать встречи при планировании задач.',
        action: 'К календарям',
        target: 'calendars',
    },
    {
        label: 'ДАВАЙ ПОЗНАКОМИМСЯ',
        title: 'Расскажи о своём опыте',
        text: 'Добавь ссылки на резюме и профессиональные профили.',
        action: 'Добавить ссылки',
        target: 'resumes',
    },
];
const deadlineTime = (task: Task) => {
    const value = task.deadline ? Date.parse(task.deadline) : NaN;
    return Number.isFinite(value) ? value : Infinity;
};
const deadlineLabel = (task: Task, timezone: string) => {
    const time = deadlineTime(task);
    if (!Number.isFinite(time)) return 'Без срока';
    const date = new Date(time);
    const today = new Date();
    const todayKey = dayKey(today, timezone);
    const tomorrowKey = shiftDay(todayKey, 1);
    const day =
        dayKey(date, timezone) === todayKey
            ? 'Сегодня'
            : dayKey(date, timezone) === tomorrowKey
              ? 'Завтра'
              : date.toLocaleDateString('ru-RU', {
                    timeZone: timezone,
                    day: 'numeric',
                    month: 'short',
                });
    return `${time < Date.now() ? 'Просрочено · ' : ''}${day}, ${date.toLocaleTimeString('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}`;
};

export const HomePage = () => {
    const navigate = useNavigate();
    const { hash } = useLocation();
    const { user } = useAuth();
    const { timezone: savedTimezone } = usePlanningTimezone();
    const timezone = savedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [slide, setSlide] = useState(0);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [saving, setSaving] = useState<string[]>([]);
    const [calendarNotice, setCalendarNotice] = useState('');
    const [links, setLinks] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [linkNotice, setLinkNotice] = useState('');
    const storageKey = `steza:resume-links:${user?.id ?? 'guest'}`;

    useEffect(() => {
        const target = hash === '#calendars' ? 'calendars' : hash === '#resumes' ? 'resumes' : null;
        if (!target) return;
        const frame = window.requestAnimationFrame(() =>
            document.getElementById(target)?.scrollIntoView({ block: 'start' }),
        );
        return () => window.cancelAnimationFrame(frame);
    }, [hash]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setTasks([]);
        listTasks(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setTasks(data);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError('Не удалось загрузить задачи.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [user?.id, retry]);

    useEffect(() => {
        setEditing(null);
        setLinkNotice('');
        try {
            const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
            setLinks(
                value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.fromEntries(
                          Object.entries(value).filter(
                              ([key, val]) =>
                                  SERVICES.some((service) => service.id === key) &&
                                  typeof val === 'string',
                          ),
                      )
                    : {},
            );
        } catch {
            setLinks({});
        }
    }, [storageKey]);

    const upcoming = tasks.filter((task) => isActive(task)).sort((a, b) => compareTasks(a, b));
    const completeTask = async (task: Task) => {
        setSaving((current) => [...current, task.id]);
        setError('');
        try {
            const updated = await finishTask(task);
            setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
        } catch (e) {
            setError(apiError(e));
        } finally {
            setSaving((current) => current.filter((id) => id !== task.id));
        }
    };
    const saveLink = (event: React.FormEvent) => {
        event.preventDefault();
        const service = SERVICES.find((item) => item.id === editing);
        if (!service) return;
        const next = { ...links };
        if (url.trim()) {
            try {
                const parsed = new URL(url.trim());
                if (
                    parsed.protocol !== 'https:' ||
                    parsed.username ||
                    parsed.password ||
                    !(
                        parsed.hostname === service.host ||
                        parsed.hostname.endsWith(`.${service.host}`)
                    )
                )
                    throw new Error();
                next[service.id] = parsed.href;
            } catch {
                setLinkNotice(`Введи HTTPS-ссылку с ${service.host}.`);
                return;
            }
        } else delete next[service.id];
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
            setLinks(next);
            setEditing(null);
            setLinkNotice('Сохранено на этом устройстве.');
        } catch {
            setLinkNotice('Не удалось сохранить ссылку на устройстве.');
        }
    };
    const banner = BANNERS[slide];

    return (
        <div className="home-page">
            <section
                className="home-banner"
                aria-label="Полезное"
                aria-roledescription="карусель"
                onTouchStart={(event) => {
                    event.currentTarget.dataset.touchX = String(event.touches[0].clientX);
                }}
                onTouchEnd={(event) => {
                    const start = Number(event.currentTarget.dataset.touchX);
                    const delta = event.changedTouches[0].clientX - start;
                    if (Math.abs(delta) > 45)
                        setSlide(
                            (current) =>
                                (current + (delta < 0 ? 1 : -1) + BANNERS.length) % BANNERS.length,
                        );
                }}
            >
                <div className="home-banner__orb" aria-hidden="true">
                    ✦
                </div>
                <div className="home-banner__copy" aria-live="polite">
                    <p className="home-eyebrow">{banner.label}</p>
                    <h1>{banner.title}</h1>
                    <p>{banner.text}</p>
                    <button
                        className="home-banner__action"
                        onClick={() =>
                            banner.target === 'chat'
                                ? navigate(PATHS.CHAT)
                                : document
                                      .getElementById(banner.target)
                                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                    >
                        {banner.action} <span aria-hidden="true">↗</span>
                    </button>
                </div>
                <div className="home-banner__dots" aria-label="Выбрать баннер">
                    {BANNERS.map((item, index) => (
                        <button
                            key={item.target}
                            aria-label={`Баннер ${index + 1}: ${item.title}`}
                            aria-current={slide === index ? 'true' : undefined}
                            onClick={() => setSlide(index)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
            </section>

            <div className="home-split">
                <section className="home-glass home-tasks" aria-labelledby="home-tasks-title">
                    <div className="home-card-heading">
                        <h2 id="home-tasks-title">Задачи</h2>
                        <span className="home-count">{loading ? '…' : upcoming.length}</span>
                    </div>
                    <p className="home-caption">Сначала самое срочное</p>
                    {loading ? (
                        <p className="home-empty" role="status">
                            Загружаем планы…
                        </p>
                    ) : (
                        <>
                            {upcoming.length === 0 && !error && (
                                <div className="home-empty">
                                    <span className="home-empty__icon" aria-hidden="true">
                                        ✓
                                    </span>
                                    <p>Всё спокойно</p>
                                    <small>Расскажи Steza о планах — начнём с первой задачи.</small>
                                </div>
                            )}
                            <ul className="home-task-list">
                                {upcoming.slice(0, 4).map((task) => (
                                    <li key={task.id}>
                                        <button
                                            className="home-task-check"
                                            disabled={
                                                saving.includes(task.id) ||
                                                task.status !== 'scheduled'
                                            }
                                            title={
                                                task.status !== 'scheduled'
                                                    ? 'Сначала запланируйте задачу на странице задач'
                                                    : 'Завершить задачу'
                                            }
                                            onClick={() => void completeTask(task)}
                                            aria-label={`Завершить: ${task.title}`}
                                        >
                                            <span />
                                        </button>
                                        <div>
                                            <p>{task.title}</p>
                                            <time
                                                className={
                                                    deadlineTime(task) < Date.now()
                                                        ? 'home-deadline--late'
                                                        : ''
                                                }
                                                dateTime={
                                                    Number.isFinite(deadlineTime(task))
                                                        ? new Date(deadlineTime(task)).toISOString()
                                                        : undefined
                                                }
                                            >
                                                {deadlineLabel(task, timezone)}
                                            </time>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {error && (
                        <div className="home-error" role="alert">
                            {error}
                            <button
                                className="home-text-button"
                                onClick={() => setRetry((value) => value + 1)}
                            >
                                Повторить
                            </button>
                        </div>
                    )}
                    <button
                        className="home-text-button home-tasks__footer"
                        onClick={() => navigate(upcoming.length ? PATHS.TASKS : PATHS.CHAT)}
                    >
                        {upcoming.length ? 'Все задачи' : 'Добавить задачу'}{' '}
                        <span aria-hidden="true">↗</span>
                    </button>
                </section>
                <NextAction />
            </div>

            <section
                className="home-glass home-connections"
                id="calendars"
                aria-labelledby="home-calendars-title"
            >
                <p className="home-eyebrow">ПЛАНЫ В ОДНОМ МЕСТЕ</p>
                <h2 id="home-calendars-title">Подключи календари</h2>
                <p className="home-description">Чтобы встречи и задачи находили своё время.</p>
                <div className="home-calendar-grid">
                    {CALENDARS.map((calendar) => (
                        <button
                            key={calendar.id}
                            className="home-calendar"
                            onClick={() =>
                                setCalendarNotice(
                                    `Подключение ${calendar.name} пока недоступно. Мы добавим его позже.`,
                                )
                            }
                        >
                            <span
                                className={`home-service-icon home-service-icon--${calendar.id}`}
                                aria-hidden="true"
                            >
                                {calendar.mark}
                            </span>
                            <strong>{calendar.name}</strong>
                            <small>Скоро</small>
                        </button>
                    ))}
                </div>
                <p className="home-notice" role="status">
                    {calendarNotice || 'Подключение календарей скоро появится.'}
                </p>
            </section>

            <section
                className="home-glass home-resumes"
                id="resumes"
                aria-labelledby="home-resumes-title"
            >
                <div className="home-card-heading">
                    <p className="home-eyebrow">ЧУТЬ БОЛЬШЕ О ТЕБЕ</p>
                    <span className="home-count">{Object.keys(links).length}/5</span>
                </div>
                <h2 id="home-resumes-title">Твой опыт — в деталях</h2>
                <p className="home-description">
                    Добавь ссылки на резюме и профессиональные профили.
                </p>
                <div className="home-resume-list">
                    {SERVICES.map((service) => (
                        <div key={service.id}>
                            <button
                                className="home-resume-row"
                                aria-expanded={editing === service.id}
                                aria-controls={
                                    editing === service.id ? `resume-form-${service.id}` : undefined
                                }
                                onClick={() => {
                                    setEditing(editing === service.id ? null : service.id);
                                    setUrl(links[service.id] ?? '');
                                    setLinkNotice('');
                                }}
                            >
                                <span
                                    className={`home-service-icon home-service-icon--${service.id}`}
                                    aria-hidden="true"
                                >
                                    {service.mark}
                                </span>
                                <span>
                                    <strong>{service.name}</strong>
                                    <small>
                                        {links[service.id] ? 'Ссылка добавлена' : 'Добавить ссылку'}
                                    </small>
                                </span>
                                <span className="home-resume-row__action" aria-hidden="true">
                                    {links[service.id] ? '↗' : '+'}
                                </span>
                            </button>
                            {editing === service.id && (
                                <form
                                    id={`resume-form-${service.id}`}
                                    className="home-link-form"
                                    onSubmit={saveLink}
                                >
                                    <label htmlFor={`resume-${service.id}`}>
                                        Ссылка на {service.name}
                                    </label>
                                    <input
                                        id={`resume-${service.id}`}
                                        type="url"
                                        autoFocus
                                        value={url}
                                        onChange={(event) => setUrl(event.target.value)}
                                        placeholder={`https://${service.host}/…`}
                                    />
                                    <small>Очисти поле и сохрани, чтобы удалить ссылку.</small>
                                    <div>
                                        <button type="submit" className="home-pill">
                                            Сохранить
                                        </button>
                                        <button
                                            type="button"
                                            className="home-text-button"
                                            onClick={() => setEditing(null)}
                                        >
                                            Отмена
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    ))}
                </div>
                <p className="home-notice" role="status">
                    {linkNotice || 'Необязательно. Ссылки сохраняются только на этом устройстве.'}
                </p>
            </section>
        </div>
    );
};
