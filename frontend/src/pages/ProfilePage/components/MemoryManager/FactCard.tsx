import { useState } from 'react';
import type { Fact, FactHistory } from '@/shared/api/contracts';
import { deleteFact, editFact, factHistory } from '@/shared/api/manage';
import { apiError } from '@/shared/api/client';
import { FACT_KIND_LABELS } from './memory.constants';
export const FactCard = ({ fact, onChanged }: { fact: Fact; onChanged: () => void }) => {
    const [editing, setEditing] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [text, setText] = useState(fact.statement);
    const [history, setHistory] = useState<FactHistory | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
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
    return (
        <article className="ui-card">
            <p className="ui-muted">
                {FACT_KIND_LABELS[fact.kind]} · {fact.expiredAt ? 'Заменённый факт' : 'Актуально'}
            </p>
            <p className="ui-preserve">{fact.statement}</p>
            <small>
                {fact.provenance === 'user_declared'
                    ? 'Записано с ваших слов'
                    : 'Подтверждено вами'}
            </small>
            <div className="ui-actions">
                <button
                    disabled={busy || !!fact.expiredAt}
                    onClick={() => {
                        setText(fact.statement);
                        setEditing((v) => !v);
                    }}
                >
                    Изменить
                </button>
                <button
                    disabled={busy}
                    onClick={() =>
                        void run(async () =>
                            setHistory(history ? null : await factHistory(fact.id)),
                        )
                    }
                >
                    {history ? 'Скрыть историю' : 'История'}
                </button>
                <button disabled={busy} className="ui-danger" onClick={() => setRemoving(true)}>
                    Удалить…
                </button>
            </div>
            {editing && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                            await editFact(fact.id, text.trim());
                            setEditing(false);
                            setHistory(null);
                            onChanged();
                        });
                    }}
                >
                    <label>
                        Новая формулировка
                        <textarea
                            maxLength={500}
                            required
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={busy}
                        />
                    </label>
                    <button disabled={busy || !text.trim()}>Сохранить факт</button>
                </form>
            )}
            {removing && (
                <div className="ui-confirm">
                    <p>Удалить этот факт без возможности восстановления?</p>
                    <div className="ui-actions">
                        <button
                            className="ui-danger"
                            disabled={busy}
                            onClick={() =>
                                void run(async () => {
                                    await deleteFact(fact.id);
                                    onChanged();
                                })
                            }
                        >
                            Удалить факт
                        </button>
                        <button disabled={busy} onClick={() => setRemoving(false)}>
                            Оставить
                        </button>
                    </div>
                </div>
            )}
            {history && (
                <div className="ui-timeline">
                    {history.items.length ? (
                        history.items.map((entry, index) => (
                            <p key={index}>
                                {
                                    {
                                        add: 'Добавлен',
                                        edit: 'Изменён',
                                        supersede: 'Заменён',
                                        delete: 'Удалён',
                                    }[entry.event]
                                }{' '}
                                · {entry.actor === 'user' ? 'Вы' : 'Steza'}
                                <small className="ui-block">
                                    {new Date(entry.at).toLocaleString('ru-RU')}
                                </small>
                            </p>
                        ))
                    ) : (
                        <p>История пуста.</p>
                    )}
                </div>
            )}
            {error && <p role="alert">{error}</p>}
        </article>
    );
};
