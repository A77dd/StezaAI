import type { DraftResult } from '@/shared/api/contracts';
import { usePlanningTimezone } from '@/app/hooks/usePlanningTimezone';
import { useEffect, useState, type FormEvent } from 'react';
import {
    createTask,
    chooseDraft,
    confirmSlot,
    nextSlots,
    type Task,
    type Slot,
    type PlanningResult,
} from '@/shared/api/steza';
import { apiError } from '@/shared/api/client';
import { ModelAccess } from '@/components/ModelAccess';

export const TaskPlanner = ({
    task,
    initialText = '',
    initialSlots = [],
    onChanged,
}: {
    task?: Task;
    initialText?: string;
    initialSlots?: Slot[];
    onChanged?: () => void;
}) => {
    const { timezone, error: timezoneError, reload: reloadTimezone } = usePlanningTimezone();
    const [text, setText] = useState(initialText);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<PlanningResult | DraftResult | null>(null);
    const [slots, setSlots] = useState<Slot[]>(initialSlots);
    const [taskId, setTaskId] = useState(task?.id);
    const [notice, setNotice] = useState('');
    const apply = (value: PlanningResult | DraftResult) => {
        setResult(value);
        setSlots('slots' in value ? value.slots : []);
        setTaskId('task' in value ? value.task.id : undefined);
        const messages: Record<string, string> = {
            proposed: 'Выберите время и подтвердите план.',
            no_slots: 'Свободного времени до срока нет. Задача сохранена без брони.',
            needs_clarification: 'Уточните, что нужно сохранить.',
            info_only: 'Это информация. Создать задачу или оставить без планирования?',
            unparseable: 'Не удалось понять задачу. Уточните действие и время.',
            meeting_booked: 'Встреча добавлена в план.',
            meeting_conflict: 'Указанное время занято. Выберите другой вариант.',
            noted: 'Планирование не требуется. Заметка не сохранялась.',
        };
        setNotice(messages[value.status]);
        onChanged?.();
    };
    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (e) {
            setError(apiError(e));
        } finally {
            setBusy(false);
        }
    };
    const loadSlots = () =>
        run(async () => {
            if (!taskId) return;
            const value = await nextSlots(taskId);
            if (value.status === 'proposed') {
                setSlots(value.slots);
                setNotice('Выберите время.');
            } else {
                setSlots([]);
                setNotice('Других свободных слотов пока нет.');
            }
        });
    useEffect(() => {
        setText(initialText);
    }, [initialText]);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        void run(async () => apply(await createTask(text.trim())));
    };
    return (
        <ModelAccess>
            <section className="ui-panel" aria-label="Планирование задачи">
                {task ? (
                    <h3>{task.title}</h3>
                ) : (
                    <form onSubmit={submit}>
                        <label>
                            Новая задача
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                required
                                maxLength={8000}
                                placeholder="Подготовить отчёт до пятницы, нужен час"
                            />
                        </label>
                        <button disabled={busy || !text.trim()}>Предложить время</button>
                    </form>
                )}
                {notice && <p role="status">{notice}</p>}
                {result && 'draftId' in result && (
                    <div className="ui-actions">
                        {(['task', 'meeting', 'reminder', 'follow_up', 'info'] as const).map(
                            (kind, index) => (
                                <button
                                    key={kind}
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () =>
                                            apply(await chooseDraft(result.draftId, kind)),
                                        )
                                    }
                                >
                                    {
                                        [
                                            'Задача',
                                            'Встреча',
                                            'Напоминание',
                                            'Вернуться к вопросу',
                                            'Не планировать',
                                        ][index]
                                    }
                                </button>
                            ),
                        )}
                    </div>
                )}
                {timezone && !!slots.length && <p>Время в часовом поясе {timezone}</p>}
                {timezoneError && (
                    <p role="alert">
                        {timezoneError}{' '}
                        <button onClick={reloadTimezone}>Повторить загрузку настроек</button>
                    </p>
                )}
                {slots.map((slot, index) => (
                    <button
                        key={slot.start}
                        disabled={busy || !timezone}
                        onClick={() =>
                            void run(async () => {
                                if (!taskId) return;
                                const value = await confirmSlot(taskId, index, slot);
                                if (value.status === 'slot_taken') {
                                    setSlots(value.slots);
                                    setNotice('Это время уже занято. Выберите новый вариант.');
                                } else if (value.status === 'no_such_slot') {
                                    setSlots([]);
                                    setNotice('Предложение устарело. Запросите новые слоты.');
                                } else {
                                    setSlots([]);
                                    setTaskId(undefined);
                                    setNotice(
                                        value.status === 'already_booked_other_slot'
                                            ? 'Задача уже запланирована на другое время.'
                                            : 'Время подтверждено. Задача в плане.',
                                    );
                                    onChanged?.();
                                }
                            })
                        }
                    >
                        {new Date(slot.start).toLocaleString('ru-RU', {
                            timeZone: timezone || undefined,
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}{' '}
                        —{' '}
                        {new Date(slot.end).toLocaleTimeString('ru-RU', {
                            timeZone: timezone || undefined,
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}{' '}
                        · Подтвердить
                    </button>
                ))}
                {taskId && (
                    <button disabled={busy} onClick={() => void loadSlots()}>
                        Подобрать {slots.length ? 'другое' : ''} время
                    </button>
                )}
                {error && <p role="alert">{error}</p>}
            </section>
        </ModelAccess>
    );
};
