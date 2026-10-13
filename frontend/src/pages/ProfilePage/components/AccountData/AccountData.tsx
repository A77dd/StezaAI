import './AccountData.css';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { deleteAccount, exportAccount } from '@/shared/api/manage';
import { apiError } from '@/shared/api/client';

export const AccountData = () => {
    const { user, logout } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState('');
    const [removing, setRemoving] = useState(false);
    const [download, setDownload] = useState<string | null>(null);
    useEffect(
        () => () => {
            if (download) URL.revokeObjectURL(download);
        },
        [download],
    );
    return (
        <section className="ui-panel">
            <h2>Мои данные</h2>
            <p className="ui-muted">Выгрузка включает задачи, переписку, память и настройки.</p>
            <button
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                        setDownload(URL.createObjectURL(await exportAccount()));
                    } catch (e) {
                        setError(apiError(e));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {busy ? 'Подождите…' : 'Подготовить выгрузку'}
            </button>
            {download && (
                <a
                    className="ui-download"
                    href={download}
                    download={`steza-data-${new Date().toISOString().slice(0, 10)}.json`}
                >
                    Скачать мои данные (JSON) ↓
                </a>
            )}
            <details
                className="account-data__deletion"
                onToggle={(e) => {
                    if (!e.currentTarget.open) {
                        setRemoving(false);
                        setConfirm('');
                    }
                }}
            >
                <summary>Удаление аккаунта</summary>
                <p>
                    Все данные на сервере будут удалены без возможности восстановления. Сначала
                    можно скачать выгрузку.
                </p>
                {!removing ? (
                    <button className="ui-danger" disabled={busy} onClick={() => setRemoving(true)}>
                        Удалить аккаунт…
                    </button>
                ) : (
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (busy || confirm !== 'УДАЛИТЬ') return;
                            setBusy(true);
                            setError('');
                            try {
                                await deleteAccount();
                                if (user) {
                                    try {
                                        localStorage.removeItem(
                                            `steza:profile-preferences:${user.id}`,
                                        );
                                        localStorage.removeItem(`steza:resume-links:${user.id}`);
                                    } catch {
                                        /* Server deletion has already succeeded. */
                                    }
                                }
                                await logout();
                            } catch (error) {
                                setError(apiError(error));
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        <label>
                            Для подтверждения введите УДАЛИТЬ
                            <input
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                autoComplete="off"
                                disabled={busy}
                            />
                        </label>
                        <div className="ui-actions">
                            <button className="ui-danger" disabled={busy || confirm !== 'УДАЛИТЬ'}>
                                Удалить навсегда
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    setRemoving(false);
                                    setConfirm('');
                                }}
                            >
                                Отмена
                            </button>
                        </div>
                    </form>
                )}
            </details>
            {error && <p role="alert">{error}</p>}
        </section>
    );
};
