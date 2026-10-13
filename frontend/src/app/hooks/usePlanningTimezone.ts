import { useEffect, useState } from 'react';
import { getSettings } from '@/shared/api/steza';
import { apiError } from '@/shared/api/client';

export const usePlanningTimezone = () => {
    const [timezone, setTimezone] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let live = true;
        setError('');
        getSettings().then(settings => { if (live) setTimezone(settings.timezone); })
            .catch(e => { if (live) setError(apiError(e)); });
        return () => { live = false; };
    }, [attempt]);
    useEffect(() => {
        const reload = () => setAttempt(value => value + 1);
        window.addEventListener('steza:settings-updated', reload);
        window.addEventListener('steza:model-access', reload);
        return () => { window.removeEventListener('steza:settings-updated', reload); window.removeEventListener('steza:model-access', reload); };
    }, []);
    return { timezone, error, reload: () => setAttempt(value => value + 1) };
};
