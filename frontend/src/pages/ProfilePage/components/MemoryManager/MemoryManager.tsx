import { FactCard } from './FactCard';
import { FACT_KIND_LABELS } from './memory.constants';
import { useEffect, useState } from 'react';
import type { Fact, FactInput } from '@/shared/api/contracts';
import { declareFact, factsPage } from '@/shared/api/manage';
import { apiError } from '@/shared/api/client';

export const MemoryManager = ({ onChanged }: { onChanged: () => void }) => {
    const [facts, setFacts] = useState<Fact[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [includeExpired, setIncludeExpired] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [retry, setRetry] = useState(0);
    const [kind, setKind] = useState<FactInput['kind']>('preference');
    const [statement, setStatement] = useState('');
    useEffect(() => {
        let live = true;
        setLoading(true);
        setError('');
        setCursor(null);
        factsPage(undefined, includeExpired)
            .then((data) => {
                if (live) {
                    setFacts(data.items);
                    setCursor(data.nextCursor);
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
    }, [includeExpired, retry]);
    const changed = () => {
        setRetry((v) => v + 1);
        onChanged();
    };
    return (
        <section className="ui-panel">
            <h3>Управление памятью</h3>
            <p className="ui-muted">
                Можно прямо записать факт — он сохранится без обработки моделью.
            </p>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    setNotice('');
                    try {
                        await declareFact({ kind, statement: statement.trim() });
                        setStatement('');
                        setNotice('Факт сохранён.');
                        changed();
                    } catch (error) {
                        setError(apiError(error));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <fieldset className="ui-fields" disabled={busy || loading}>
                    <label>
                        О чём факт
                        <select
                            value={kind}
                            onChange={(e) => setKind(e.target.value as FactInput['kind'])}
                        >
                            {Object.entries(FACT_KIND_LABELS).map(([value, title]) => (
                                <option key={value} value={value}>
                                    {title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Что запомнить
                        <textarea
                            value={statement}
                            onChange={(e) => setStatement(e.target.value)}
                            maxLength={500}
                            required
                            placeholder="Например: предпочитаю созвоны после обеда"
                        />
                    </label>
                    <button className="ui-primary" disabled={!statement.trim()}>
                        Запомнить мои слова
                    </button>
                </fieldset>
            </form>
            <label className="ui-check">
                <input
                    type="checkbox"
                    checked={includeExpired}
                    disabled={busy || loading}
                    onChange={(e) => setIncludeExpired(e.target.checked)}
                />
                Показывать заменённые факты
            </label>
            {loading ? (
                <p role="status">Загружаем память…</p>
            ) : (
                <>
                    {facts.length === 0 && !error && <p>Фактов пока нет.</p>}
                    {facts.map((fact) => (
                        <FactCard key={fact.id} fact={fact} onChanged={changed} />
                    ))}
                </>
            )}
            {cursor && !loading && (
                <button
                    disabled={busy}
                    onClick={async () => {
                        if (busy) return;
                        setBusy(true);
                        setError('');
                        try {
                            const data = await factsPage(cursor, includeExpired);
                            if (data.nextCursor === cursor) throw new Error('Repeated cursor');
                            setFacts((current) => [
                                ...new Map(
                                    [...current, ...data.items].map((fact) => [fact.id, fact]),
                                ).values(),
                            ]);
                            setCursor(data.nextCursor);
                        } catch (e) {
                            setError(apiError(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Ещё факты
                </button>
            )}
            {notice && <p role="status">{notice}</p>}
            {error && (
                <div role="alert">
                    <p>{error}</p>
                    <button disabled={busy} onClick={() => setRetry((v) => v + 1)}>
                        Обновить память
                    </button>
                </div>
            )}
        </section>
    );
};
