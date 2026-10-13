import { TimezoneSelect } from '@/components/TimezoneSelect';
import { deviceTimezone } from '@/shared/library/timezone';
import { useEffect, useState, type ReactNode } from 'react';
import { getConsent, getSettings, giveConsent, saveTimezone } from '@/shared/api/steza';
import { apiError } from '@/shared/api/client';
import type { Consent, Settings } from '@/shared/api/contracts';
export const ModelAccess = ({ children }: { children: ReactNode }) => {
    const [consent, setConsent] = useState<Consent | null>(null);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [timezone, setTimezone] = useState(deviceTimezone);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let live = true;
        setConsent(null);
        setSettings(null);
        setError('');
        Promise.all([getConsent(), getSettings()])
            .then(([c, s]) => {
                if (live) {
                    setConsent(c);
                    setSettings(s);
                    if (s.timezoneConfirmed) setTimezone(s.timezone);
                }
            })
            .catch((e) => {
                if (live) setError(apiError(e));
            });
        return () => {
            live = false;
        };
    }, [retry]);
    useEffect(() => {
        const reload = () => setRetry((v) => v + 1);
        window.addEventListener('steza:model-access', reload);
        return () => window.removeEventListener('steza:model-access', reload);
    }, []);
    if (consent?.given && settings?.timezoneConfirmed) return <>{children}</>;
    const save = async (kind: 'consent' | 'timezone') => {
        setBusy(true);
        setError('');
        try {
            if (kind === 'consent' && consent)
                setConsent(await giveConsent(consent.current.version));
            else {
                setSettings(await saveTimezone(timezone));
                window.dispatchEvent(new Event('steza:settings-updated'));
            }
        } catch (e) {
            setError(apiError(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="ui-panel" aria-label="Подготовка помощника">
            {!consent && !error && <p role="status">Проверяем настройки…</p>}
            {consent && !consent.given && (
                <>
                    <h3>Перед первым обращением</h3>
                    <p className="ui-preserve">{consent.current.text}</p>
                    <p>Провайдеры: {consent.current.providers.join(', ')}</p>
                    <button disabled={busy} onClick={() => void save('consent')}>
                        Согласен на обработку текста
                    </button>
                </>
            )}
            {settings && !settings.timezoneConfirmed && (
                <>
                    <TimezoneSelect value={timezone} onChange={setTimezone} disabled={busy} />
                    <button
                        disabled={busy || !timezone.trim()}
                        onClick={() => void save('timezone')}
                    >
                        Подтвердить часовой пояс
                    </button>
                </>
            )}
            {error && (
                <>
                    <p role="alert">{error}</p>
                    <button disabled={busy} onClick={() => setRetry((v) => v + 1)}>
                        Обновить
                    </button>
                </>
            )}
        </section>
    );
};
