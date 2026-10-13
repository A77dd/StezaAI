import { TaskDetails } from './components/TaskDetails';
import { TaskOverview } from './components/TaskOverview';
import { usePlanningTimezone } from '@/app/hooks/usePlanningTimezone';
import { dayKey, shiftDay } from '@/shared/library/planningTime';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import './TasksPage.css';
import { TaskPlanner } from '@/components/TaskPlanner';

const deadlineTime = (task: Task) => {
    const time = task.deadline ? Date.parse(task.deadline) : NaN;
    return Number.isFinite(time) ? time : Infinity;
};

const groupTasks = (tasks: Task[], now: Date, timezone: string) => {
    const todayKey = dayKey(now, timezone);
    const tomorrowKey = shiftDay(todayKey, 1);
    const groups = new Map<string, { label: string; tasks: Task[] }>();
    [...tasks]
        .sort((a, b) => compareTasks(a, b))
        .forEach((task) => {
            const time = deadlineTime(task);
            const date = Number.isFinite(time) ? new Date(time) : null;
            const key = date ? dayKey(date, timezone) : 'undated';
            const label = !date
                ? 'Без срока'
                : key === todayKey
                  ? 'Сегодня'
                  : key === tomorrowKey
                    ? 'Завтра'
                    : date.toLocaleDateString('ru-RU', {
                          timeZone: timezone,
                          weekday: 'short',
                          day: 'numeric',
                          month: 'long',
                          ...(date.getFullYear() !== now.getFullYear()
                              ? { year: 'numeric' as const }
                              : {}),
                      });
            if (!groups.has(key)) groups.set(key, { label, tasks: [] });
            groups.get(key)!.tasks.push(task);
        });
    return Array.from(groups, ([key, value]) => ({ key, ...value }));
};

export const TasksPage = () => {
    const { user } = useAuth();
    const { timezone: savedTimezone } = usePlanningTimezone();
    const timezone = savedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedTask = searchParams.get('task');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [actionError, setActionError] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const [pending, setPending] = useState<string[]>([]);
    const [filter, setFilter] = useState<'active' | 'done' | 'cancelled'>('active');
    const [retry, setRetry] = useState(0);
    const [now, setNow] = useState(() => new Date());
    const [detailId, setDetailId] = useState<string | null>(null);
    const [planner, setPlanner] = useState<Task | 'new' | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setLoadError(false);
        setTasks([]);
        setActionError('');
        setAnnouncement('');
        listTasks(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setTasks(data);
            })
            .catch(() => {
                if (!controller.signal.aborted) setLoadError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [user?.id, retry]);

    useEffect(() => {
        if (!requestedTask || loading) return;
        const target = tasks.find((task) => task.id === requestedTask);
        if (!target) return;
        setFilter(
            target.status === 'done'
                ? 'done'
                : target.status === 'cancelled'
                  ? 'cancelled'
                  : 'active',
        );
        setDetailId(target.id);
    }, [requestedTask, loading]);

    useEffect(() => {
        if (!detailId) return;
        const frame = requestAnimationFrame(() =>
            document
                .querySelector('[aria-label="Карточка задачи"]')
                ?.scrollIntoView({ block: 'start' }),
        );
        return () => cancelAnimationFrame(frame);
    }, [detailId]);

    const active = tasks.filter((task) => isActive(task));
    const completed = tasks.filter((task) => task.status === 'done');
    const cancelled = tasks.filter((task) => task.status === 'cancelled');
    const groups = groupTasks(
        filter === 'active' ? active : filter === 'done' ? completed : cancelled,
        now,
        timezone,
    );
    const first = [...active].sort((a, b) => compareTasks(a, b))[0];

    const toggleTask = async (task: Task) => {
        if (task.status !== 'scheduled') return;
        setPending((current) => [...current, task.id]);
        setActionError('');
        setAnnouncement('');
        try {
            const updated = await finishTask(task);
            setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
            setAnnouncement('Задача перенесена в выполненные.');
        } catch (e) {
            setActionError(apiError(e));
        } finally {
            setPending((current) => current.filter((id) => id !== task.id));
        }
    };

    return (
        <div className="tasks-page">
            {detailId && (
                <TaskDetails
                    key={detailId}
                    id={detailId}
                    onClose={() => setDetailId(null)}
                    onChanged={() => setRetry((value) => value + 1)}
                />
            )}

            <button
                className="tasks-page__text-button"
                onClick={() => setPlanner(planner ? null : 'new')}
            >
                {planner ? 'Закрыть планирование' : '+ Новая задача'}
            </button>
            {planner && (
                <TaskPlanner
                    key={planner === 'new' ? 'new' : planner.id}
                    task={planner === 'new' ? undefined : planner}
                    onChanged={() => setRetry((value) => value + 1)}
                />
            )}
            <section className="tasks-offer" aria-labelledby="tasks-offer-title">
                <div className="tasks-offer__decoration" aria-hidden="true">
                    ✦
                </div>
                <p className="tasks-page__eyebrow">ПРЕДЛОЖЕНИЕ ОТ STEZA</p>
                <h1 id="tasks-offer-title">Одно дело — уже шаг вперёд</h1>
                <p className="tasks-offer__text">
                    {first
                        ? `Давай начнём с «${first.title}». Обсудим, как найти время и с чего начать?`
                        : 'Давай выберем главное на сегодня и разобьём большую цель на небольшие задачи.'}
                </p>
                <button className="tasks-offer__button" onClick={() => navigate(PATHS.CHAT)}>
                    Обсудить план <span aria-hidden="true">↗</span>
                </button>
            </section>

            <section
                className="tasks-agenda"
                aria-labelledby="tasks-agenda-title"
                aria-busy={loading}
            >
                <div className="tasks-agenda__heading">
                    <div>
                        <p className="tasks-page__eyebrow">В СВОЁМ ТЕМПЕ</p>
                        <h2 id="tasks-agenda-title">Твои задачи</h2>
                    </div>
                    <button
                        className="tasks-agenda__add"
                        aria-label="Добавить задачу"
                        onClick={() => setPlanner('new')}
                    >
                        +
                    </button>
                </div>
                <div className="tasks-agenda__filters" role="group" aria-label="Показать задачи">
                    <button aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>
                        В планах <span>{active.length}</span>
                    </button>
                    <button aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>
                        Готово <span>{completed.length}</span>
                    </button>
                    <button
                        aria-pressed={filter === 'cancelled'}
                        onClick={() => setFilter('cancelled')}
                    >
                        Отменено <span>{cancelled.length}</span>
                    </button>
                </div>

                {loading ? (
                    <div className="tasks-page__empty" role="status">
                        Загружаем твои задачи…
                    </div>
                ) : loadError ? (
                    <div className="tasks-page__empty" role="alert">
                        <h3>Не удалось загрузить задачи</h3>
                        <p>Попробуй ещё раз — твои планы никуда не пропали.</p>
                        <button
                            className="tasks-page__text-button"
                            onClick={() => setRetry((value) => value + 1)}
                        >
                            Повторить загрузку ↗
                        </button>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="tasks-page__empty">
                        <span className="tasks-page__empty-icon" aria-hidden="true">
                            ✓
                        </span>
                        <h3>
                            {filter === 'cancelled'
                                ? 'Отменённых задач нет'
                                : filter === 'done'
                                  ? 'Здесь будут твои победы'
                                  : 'Можно начать с малого'}
                        </h3>
                        <p>
                            {filter === 'cancelled'
                                ? 'Отменённые задачи остаются в истории.'
                                : filter === 'done'
                                  ? 'Отмечай выполненные задачи — они появятся в этом списке.'
                                  : 'Расскажи Steza, что нужно сделать. Вместе составим план.'}
                        </p>
                        {filter === 'active' && (
                            <button
                                className="tasks-page__text-button"
                                onClick={() => setPlanner('new')}
                            >
                                Добавить первую задачу ↗
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="tasks-agenda__groups">
                        {groups.map((group) => (
                            <section className="tasks-day" key={group.key} aria-label={group.label}>
                                <h3>
                                    {group.label}
                                    <span>{group.tasks.length}</span>
                                </h3>
                                <ul>
                                    {group.tasks.map((task) => {
                                        const time = deadlineTime(task);
                                        const overdue = isActive(task) && time < now.getTime();
                                        const done = task.status === 'done';
                                        return (
                                            <li
                                                className={`tasks-entry${done ? ' tasks-entry--done' : ''}${overdue ? ' tasks-entry--overdue' : ''}`}
                                                key={task.id}
                                                id={`task-${task.id}`}
                                            >
                                                <button
                                                    className="tasks-entry__check"
                                                    aria-label={`${done ? 'Выполнено' : 'Завершить'}: ${task.title}`}
                                                    aria-pressed={done}
                                                    disabled={
                                                        pending.includes(task.id) ||
                                                        task.status !== 'scheduled'
                                                    }
                                                    onClick={() => void toggleTask(task)}
                                                >
                                                    <span aria-hidden="true">
                                                        {pending.includes(task.id)
                                                            ? '…'
                                                            : done
                                                              ? '✓'
                                                              : ''}
                                                    </span>
                                                </button>
                                                <div className="tasks-entry__body">
                                                    <button
                                                        className="tasks-page__text-button"
                                                        onClick={() => setDetailId(task.id)}
                                                    >
                                                        {task.title} ↗
                                                    </button>
                                                    {isActive(task) &&
                                                        task.status !== 'scheduled' && (
                                                            <button
                                                                className="tasks-page__text-button"
                                                                onClick={() => setPlanner(task)}
                                                            >
                                                                Запланировать ↗
                                                            </button>
                                                        )}
                                                    {(overdue || task.status === 'scheduled') && (
                                                        <small>
                                                            {overdue ? 'Срок прошёл' : 'В работе'}
                                                        </small>
                                                    )}
                                                </div>
                                                {Number.isFinite(time) && (
                                                    <time dateTime={new Date(time).toISOString()}>
                                                        {new Date(time).toLocaleTimeString(
                                                            'ru-RU',
                                                            {
                                                                timeZone: timezone,
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            },
                                                        )}
                                                    </time>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
                {actionError && (
                    <p className="tasks-page__error" role="alert">
                        {actionError}
                    </p>
                )}
                <p className="tasks-page__announcement" role="status">
                    {announcement}
                </p>
                {!loading && !loadError && groups.length > 0 && (
                    <p className="tasks-agenda__hint">
                        {filter === 'active'
                            ? 'Ближайшие сроки — первыми. Нажми на кружок, когда готово.'
                            : 'История задач. Повторное открытие не поддерживается сервером.'}
                    </p>
                )}
            </section>
            <TaskOverview
                timezone={timezone}
                revision={retry}
                onOpen={(id) => {
                    setDetailId(id);
                    window.requestAnimationFrame(() =>
                        document
                            .querySelector('[aria-label="Карточка задачи"]')
                            ?.scrollIntoView({ block: 'start' }),
                    );
                }}
            />
        </div>
    );
};
