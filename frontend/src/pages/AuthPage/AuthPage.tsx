import { useState, type FormEvent } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { apiError } from '@/shared/api/client';
import './AuthPage.css';
export const AuthPage = () => {
    const auth = useAuth();
    const [handle, setHandle] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (event: FormEvent) => {
        event.preventDefault(); setBusy(true); setError('');
        try { await auth.loginDev(handle.trim()); } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
    };
    return <div className="auth-page"><div className="auth-page__content">
        <h1 className="auth-page__logo">StezaAI</h1><p className="auth-page__subtitle">Открой приложение через Telegram, чтобы начать.</p>
        {(auth.error || error) && <p role="alert">{error || auth.error}</p>}
        <button className="profile-pill" onClick={auth.retry}>Повторить вход</button>
        {import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) && <form onSubmit={submit} className="ui-panel"><label htmlFor="dev-handle">Вход для разработки</label><input id="dev-handle" value={handle} onChange={e => setHandle(e.target.value)} pattern="[a-z0-9_]{3,32}" required placeholder="dev_user" /><button disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button></form>}
    </div></div>;
};
