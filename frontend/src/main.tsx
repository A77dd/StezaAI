// src/main.tsx
//import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TelegramProvider } from '@/app/providers/TelegramProvider';
import { AuthProvider } from '@/app/providers/AuthProvider';
import App from './App';
import '@/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    //<React.StrictMode>
        <BrowserRouter>
            <TelegramProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </TelegramProvider>
        </BrowserRouter>
    //</React.StrictMode>
);