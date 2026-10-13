import { TaskEditForm } from './TaskEditForm';
import { CheckInForm } from './CheckInForm';
import { TASK_STATUS_LABELS, TASK_KIND_LABELS } from './task.constants';
import { useEffect, useState } from 'react';
import type { Task, Slot } from '@/shared/api/contracts';
import { cancelTask, checkIn, getTask, updateTask } from '@/shared/api/manage';
import { apiError } from '@/shared/api/client';
import { TaskPlanner } from '@/components/TaskPlanner';

export const TaskDetails = ({
    id,
    onChanged,
    onClose,
}: {
    id: string;
    onChanged: () => void;
    onClose: () => void;
}) => {
    const [task, setTask] = useState<Task | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    const [editing, setEditing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [slots, setSlots] = useState<Slot[]>([]);
    useEffect(() => {
        let live = true;
        setError('');
        getTask(id)
            .then((data) => {
                if (live) setTask(data);
            })
            .catch((e) => {
                if (live) setError(apiError(e));
            });
        return () => {
            live = false;
        };
    }, [id, retry]);
    const run = async (action: () => Promise<void>) => {
        if (busy) return false;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await action();
            return true;
        } catch (e) {
            setError(apiError(e));
            return false;
        } finally {
            setBusy(false);
        }
    };
    const active = task && !['done', 'cancelled'].includes(task.status);
    return (
        <section className="ui-panel" aria-label="Карточка задачи">
            <div className="ui-heading">
                <h2>{task?.title || 'Загружаем задачу…'}</h2>
                <button disabled={busy} onClick={onClose} aria-label="Закрыть карточку задачи">
                    ✕
                </button>
            </div>
            {task && (
                <>
                    <p className="ui-muted">
                        {TASK_KIND_LABELS[task.kind]} · {TASK_STATUS_LABELS[task.status]}
                    </p>
                    {task.description && <p className="ui-preserve">{task.description}</p>}
                    {task.meetingUrl && /^https?:\/\//i.test(task.meetingUrl) && (
                        <a href={task.meetingUrl} target="_blank" rel="noreferrer">
                            Открыть ссылку встречи ↗
                        </a>
                    )}
                    <details>
                        <summary>Исходное сообщение</summary>
                        <p className="ui-preserve">{task.source.text}</p>
                        {task.source.author && <p>{task.source.author}</p>}
                    </details>
                    {active && (
                        <div className="ui-actions">
                            <button
                                disabled={busy}
                                aria-expanded={editing}
                                onClick={() => setEditing((v) => !v)}
                            >
                                {editing ? 'Закрыть редактирование' : 'Изменить задачу'}
                            </button>
                            <button
                                className="ui-danger"
                                disabled={busy}
                                onClick={() => setCancelling(true)}
                            >
                                Отменить задачу…
                            </button>
                        </div>
                    )}
                    {cancelling && (
                        <div className="ui-confirm">
                            <p>Отменить «{task.title}»? Бронь и напоминания будут сняты.</p>
                            <div className="ui-actions">
                                <button
                                    disabled={busy}
                                    className="ui-danger"
                                    onClick={() =>
                                        void run(async () => {
                                            const data = await cancelTask(id);
                                            setTask(data.task);
                                            setCancelling(false);
                                            setEditing(false);
                                            setSlots([]);
                                            setNotice('Задача отменена.');
                                            onChanged();
                                        })
                                    }
                                >
                                    Да, отменить задачу
                                </button>
                                <button disabled={busy} onClick={() => setCancelling(false)}>
                                    Оставить
                                </button>
                            </div>
                        </div>
                    )}
                    {editing && active && (
                        <TaskEditForm
                            key={`${id}-${retry}`}
                            task={task}
                            busy={busy}
                            onSave={(patch) =>
                                void run(async () => {
                                    if (!Object.keys(patch).length) {
                                        setNotice('Нет изменений.');
                                        return;
                                    }
                                    const data = await updateTask(id, patch);
                                    setTask(data.task);
                                    setSlots('slots' in data ? data.slots : []);
                                    setEditing(false);
                                    setNotice(
                                        data.status === 'proposed'
                                            ? 'Изменения сохранены. Подтвердите новое время ниже.'
                                            : data.status === 'no_slots'
                                              ? 'Сохранено без брони: свободного времени нет.'
                                              : 'Изменения сохранены.',
                                    );
                                    onChanged();
                                })
                            }
                        />
                    )}
                    {task.status === 'scheduled' && (
                        <CheckInForm
                            busy={busy}
                            onSubmit={(input) =>
                                run(async () => {
                                    const data = await checkIn(id, input);
                                    setTask(data.task);
                                    setSlots([]);
                                    const follow = {
                                        reschedule: ' Подберите новое время ниже.',
                                        split: ' Попробуйте разделить задачу на небольшие шаги.',
                                        reprioritize: ' Пересмотрите приоритет задачи.',
                                    };
                                    setNotice(
                                        (data.repeated
                                            ? 'Ответ для этого блока уже был записан.'
                                            : 'Ответ сохранён.') +
                                            (data.followUp ? follow[data.followUp] : '') +
                                            (data.memory.candidates.length
                                                ? ' В профиле появились факты для подтверждения.'
                                                : data.memory.status === 'unavailable'
                                                  ? ' Извлечь факты сейчас не удалось.'
                                                  : ''),
                                    );
                                    onChanged();
                                })
                            }
                        />
                    )}
                    {(task.status === 'inbox' || task.status === 'proposed') && (
                        <TaskPlanner
                            key={`${id}-${task.status}-${slots.map((s) => s.start).join()}`}
                            task={task}
                            initialSlots={slots}
                            onChanged={() => {
                                setRetry((v) => v + 1);
                                onChanged();
                            }}
                        />
                    )}
                </>
            )}
            {notice && <p role="status">{notice}</p>}
            {error && (
                <div role="alert">
                    <p>{error}</p>
                    <button disabled={busy} onClick={() => setRetry((v) => v + 1)}>
                        Обновить задачу
                    </button>
                </div>
            )}
        </section>
    );
};
