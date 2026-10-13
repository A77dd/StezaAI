import { useEffect, useState } from 'react';
import { calendar, pendingCheckIns } from '@/shared/api/manage';
import type { Calendar, PendingCheckIns } from '@/shared/api/contracts';
import { apiError } from '@/shared/api/client';

export const TaskOverview = ({
    timezone,
    revision,
    onOpen,
}: {
    timezone: string;
    revision: number;
    onOpen: (id: string) => void;
}) => {
    const [items, setItems] = useState<Calendar['items']>([]);
    const [pending, setPending] = useState<PendingCheckIns['items']>([]);
    const [offset, setOffset] = useState(0);
    const [retry, setRetry] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [anchor] = useState(() => Date.now());
    const from = new Date(anchor + offset * 7 * 86400000).toISOString();
    const to = new Date(Date.parse(from) + 7 * 86400000).toISOString();
    const format = (value: string) =>
        new Date(value).toLocaleString('ru-RU', {
            timeZone: timezone,
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    useEffect(() => {
        let live = true;
        setLoading(true);
        setError('');
        Promise.all([calendar(from, to), pendingCheckIns()])
            .then(([events, checks]) => {
                if (live) {
                    setItems([...events.items].sort((a, b) => a.start.localeCompare(b.start)));
                    setPending(checks.items);
                }
            })
            .catch((e) => {
                if (live) setError(apiError(e));
            })
            .finally(() => {
                if (live) setLoading(false);
            });
        return () => {
            live = false;
        };
    }, [from, to, revision, retry]);
    return (
        <section className="ui-panel">
            <h2>Мой календарь</h2>
            <p className="ui-muted">Занятое время в Steza · {timezone}</p>
            <div className="ui-actions">
                <button onClick={() => setOffset((v) => v - 1)} disabled={loading}>
                    ← Неделя
                </button>
                <button onClick={() => setOffset(0)} disabled={loading || offset === 0}>
                    Сейчас
                </button>
                <button onClick={() => setOffset((v) => v + 1)} disabled={loading}>
                    Неделя →
                </button>
            </div>
            <p>
                {format(from)} — {format(to)}
            </p>
            {loading ? (
                <p role="status">Обновляем календарь…</p>
            ) : error ? (
                <div role="alert">
                    <p>{error}</p>
                    <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>
                </div>
            ) : (
                <>
                    {items.length === 0 && (
                        <p className="ui-muted">На этот период нет занятых блоков.</p>
                    )}
                    {items.map((item, index) => (
                        <article className="ui-card" key={`${item.start}-${index}`}>
                            <strong>{item.title || 'Занято'}</strong>
                            <p>
                                {format(item.start)} — {format(item.end)}
                            </p>
                            {item.taskId && (
                                <button onClick={() => onOpen(item.taskId!)}>
                                    Открыть задачу ↗
                                </button>
                            )}
                        </article>
                    ))}
                    {!!pending.length && (
                        <>
                            <h3>Как прошли эти дела?</h3>
                            {pending.map((item) => (
                                <button key={item.taskId} onClick={() => onOpen(item.taskId)}>
                                    <strong>{item.title}</strong>
                                    <span className="ui-block">{item.question}</span>
                                    <small>{format(item.blockEnd)}</small>
                                </button>
                            ))}
                        </>
                    )}
                </>
            )}
        </section>
    );
};
