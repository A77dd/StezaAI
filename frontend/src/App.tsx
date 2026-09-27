// src/App.tsx
import { useEffect, useState } from 'react';
import { AppRouter } from '@/app/routes';
import { useAuth } from '@/app/hooks/useAuth';
import { LoadingScreen } from '@/components/LoadingScreen';

const SPLASH_MIN_DURATION = 2000;

function App() {
    const { isReady } = useAuth();
    const [splashDone, setSplashDone] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setSplashDone(true), SPLASH_MIN_DURATION);
        return () => clearTimeout(timer);
    }, []);

    if (!splashDone || !isReady) {
        return <LoadingScreen />;
    }

    return <AppRouter />;
}

export default App;