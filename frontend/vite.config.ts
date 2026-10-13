// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    server: {
        proxy: { '/v1': {
            target: loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || 'http://127.0.0.1:3000',
            changeOrigin: true,
            bypass(req) {
                const host = req.headers['x-forwarded-host'] || req.headers.host || '';
                if (req.url?.split('?')[0] === '/v1/auth/dev' && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(host))) return false;
            }
        } },
        port: 5173,    
        watch: {
            ignored: ['**/*.py', '**/*.exe', '**/node_modules/**']
        },     
        allowedHosts: [
            '.cloudpub.ru',
            'localhost'
        ]
    }
}));
