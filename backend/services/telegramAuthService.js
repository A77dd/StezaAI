const crypto = require('crypto');

class TelegramAuthService {
    /**
     * Проверяет подпись initData от Telegram WebApp.
     * @param {string} initData — window.Telegram.WebApp.initData
     * @returns {{ user: object|null, error: string|null }}
     */
    static verifyInitData(initData) {
        console.log('🔍 [verifyInitData] initData length:', initData?.length);
        
        if (!initData || typeof initData !== 'string') {
            console.log('❌ initData отсутствует');
            return { user: null, error: 'initData отсутствует' };
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            console.log('❌ TELEGRAM_BOT_TOKEN не задан');
            return { user: null, error: 'TELEGRAM_BOT_TOKEN не задан' };
        }

        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        console.log('🔍 hash из initData:', hash ? hash.substring(0, 16) + '...' : 'НЕТ');
        
        if (!hash) {
            console.log('❌ hash отсутствует');
            return { user: null, error: 'hash отсутствует' };
        }

        const dataCheckString = [...params.entries()]
            .filter(([k]) => k !== 'hash')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();

        const computedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        console.log('🔍 computed hash:', computedHash.substring(0, 16) + '...');
        console.log('🔍 match:', computedHash === hash);
        
        if (computedHash !== hash) {
            console.log('❌ Подпись невалидна');
            return { user: null, error: 'Подпись Telegram невалидна' };
        }

        const authDate = parseInt(params.get('auth_date'), 10);
        console.log('🔍 auth_date:', authDate, '(', new Date(authDate * 1000).toISOString(), ')');
        
        if (!authDate) {
            console.log('❌ auth_date отсутствует');
            return { user: null, error: 'auth_date отсутствует' };
        }
        
        const now = Math.floor(Date.now() / 1000);
        const age = now - authDate;
        console.log('🔍 возраст initData (сек):', age);
        
        if (age > 24 * 60 * 60) {
            console.log('❌ initData устарел');
            return { user: null, error: 'initData устарел' };
        }

        const userJson = params.get('user');
        if (!userJson) {
            console.log('❌ user отсутствует');
            return { user: null, error: 'user отсутствует' };
        }

        let user;
        try { 
            user = JSON.parse(userJson);
            console.log('🔍 user:', user.id, user.first_name);
        } catch { 
            console.log('❌ user не JSON');
            return { user: null, error: 'user не JSON' }; 
        }
        console.log('🔍 Parsed TG user:', JSON.stringify(user));

        if (!user.id) {
            console.log('❌ user.id отсутствует');
            return { user: null, error: 'user.id отсутствует' };
        }

        console.log('✅ initData валиден');
        return { user, error: null };
    }
}

module.exports = TelegramAuthService;