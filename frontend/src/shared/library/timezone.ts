export function deviceTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

const cities: Record<string, string> = {
    UTC: 'Всемирное время',
    'Europe/Kaliningrad': 'Калининград',
    'Europe/Moscow': 'Москва',
    'Europe/Samara': 'Самара',
    'Asia/Yekaterinburg': 'Екатеринбург',
    'Asia/Omsk': 'Омск',
    'Asia/Krasnoyarsk': 'Красноярск',
    'Asia/Irkutsk': 'Иркутск',
    'Asia/Yakutsk': 'Якутск',
    'Asia/Vladivostok': 'Владивосток',
    'Asia/Magadan': 'Магадан',
    'Asia/Kamchatka': 'Камчатка',
    'Europe/Minsk': 'Минск',
    'Europe/Kyiv': 'Киев',
    'Europe/Kiev': 'Киев',
    'Asia/Almaty': 'Алматы',
    'Asia/Tashkent': 'Ташкент',
    'Asia/Tbilisi': 'Тбилиси',
    'Asia/Yerevan': 'Ереван',
    'Asia/Dubai': 'Дубай',
    'Europe/London': 'Лондон',
    'Europe/Berlin': 'Берлин',
    'Europe/Paris': 'Париж',
    'America/New_York': 'Нью-Йорк',
    'America/Los_Angeles': 'Лос-Анджелес',
    'Asia/Tokyo': 'Токио',
    'Asia/Shanghai': 'Шанхай',
    'Asia/Kolkata': 'Калькутта',
    'Australia/Sydney': 'Сидней',
};

export function formatTimezoneLabel(zone: string, now: Date): string {
    try {
        const offset = new Intl.DateTimeFormat('en', {
            timeZone: zone,
            timeZoneName: 'shortOffset',
        })
            .formatToParts(now)
            .find((part) => part.type === 'timeZoneName')
            ?.value.replace('GMT', 'UTC');
        return `${cities[zone] || zone.replace(/_/g, ' ')} · ${offset || 'UTC'}`;
    } catch {
        return zone;
    }
}

export function getTimezoneOptions(detected: string, value: string) {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
    let zones = Object.keys(cities);
    try {
        zones = intl.supportedValuesOf?.('timeZone') || zones;
    } catch {
        /* Older WebViews use the fallback list. */
    }
    const now = new Date();
    return [...new Set([...zones, 'UTC', detected, value].filter(Boolean))]
        .filter((zone) => zone !== detected)
        .map((zone) => ({ zone, text: formatTimezoneLabel(zone, now) }))
        .sort((a, b) => a.text.localeCompare(b.text, 'ru'));
}
