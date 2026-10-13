import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, apiBase, apiError, getToken, setToken } from './client';
import { listTasks, completeTask, compareTasks, createTask, confirmSlot, decideCandidate, askSteza, chatHistory, isActive } from './steza';
import { authTelegram, getMe } from '@/entities/user/user';
import { completeOnboarding } from '@/entities/onboarding';
import type { Task } from './contracts';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: 'Тест', kind: 'task', status: 'proposed', priority: 'normal', deadline: null, durationMinutes: 30, description: null, meetingUrl: null, bookingId: null, createdAt: '2026-10-10T10:00:00Z', source: { type: 'mini_app', text: 'Тест', author: null, sentAt: null }, ...extra });
const me = { id: 'e6b06ef5-3f00-414c-ae1a-ad62d1e54e88', createdAt: '2026-10-10T10:00:00Z', onboardingCompleted: true, modelConsent: false };
let requests: InternalAxiosRequestConfig[];
let respond: (config: InternalAxiosRequestConfig) => unknown;
beforeEach(() => {
    requests = []; respond = () => ({});
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal('window', new EventTarget());
    apiClient.defaults.adapter = async config => { requests.push(config); return { data: respond(config), status: 200, statusText: 'OK', headers: {}, config }; };
});
describe('API v1 integration', () => {
    it('normalizes server URLs without duplicating v1 or using the old api prefix', () => {
        expect(apiBase()).toBe('/v1'); expect(apiBase('https://example.test/api/')).toBe('https://example.test/v1'); expect(apiBase('https://example.test/v1')).toBe('https://example.test/v1');
    });
    it('uses accessToken and raw /me response, preserving UUID and consent', async () => {
        respond = config => config.url === '/auth/telegram' ? { accessToken: 'new-token', expiresAt: '2026-10-11T00:00:00Z', user: me } : me;
        const auth = await authTelegram('signed-init-data'); expect(auth.token).toBe('new-token'); expect(auth.user.id).toBe(me.id); expect(auth.user.onboarding_completed).toBe(true);
        setToken(auth.token); expect((await getMe()).modelConsent).toBe(false); expect(requests[1].url).toBe('/me'); expect(requests[1].headers.Authorization).toBe('Bearer new-token'); expect(requests[0].headers.Authorization).toBeUndefined();
    });
    it('loads every cursor page and deduplicates overlapping tasks', async () => {
        respond = config => config.params.cursor ? { items: [task('a'), task('b')], nextCursor: null } : { items: [task('a')], nextCursor: 'next' };
        expect((await listTasks()).map(t => t.id)).toEqual(['a', 'b']); expect(requests[1].params.cursor).toBe('next');
    });
    it('rejects repeated cursors instead of looping or returning a partial list', async () => {
        respond = () => ({ items: [], nextCursor: 'loop' }); await expect(listTasks()).rejects.toThrow('Repeated task cursor');
    });
    it('supports v1 statuses, deadlines and priority sorting', () => {
        expect(isActive(task('a'))).toBe(true); expect(isActive(task('b', { status: 'done' }))).toBe(false);
        expect([task('low', { priority: 'low' }), task('high', { priority: 'high' }), task('due', { deadline: '2026-10-10T10:00:00Z' })].sort(compareTasks).map(t => t.id)).toEqual(['due', 'high', 'low']);
    });
    it('completes scheduled tasks by check-in, never by unsupported PATCH status', async () => {
        const scheduled = task('a', { status: 'scheduled', bookingId: 'booking' }); respond = () => ({ task: { ...scheduled, status: 'done' } });
        expect((await completeTask(scheduled)).status).toBe('done'); expect(requests[0].url).toBe('/tasks/a/check-in'); expect(JSON.parse(requests[0].data)).toEqual({ outcome: 'done' });
        await expect(completeTask(task('b'))).rejects.toThrow(); expect(requests).toHaveLength(1);
    });
    it('sends text creation and explicit slot confirmation with original timestamps', async () => {
        respond = () => ({ status: 'unparseable' }); await createTask('Отчёт до пятницы'); expect(JSON.parse(requests[0].data)).toEqual({ text: 'Отчёт до пятницы' });
        const slot = { start: '2026-10-11T10:00:00Z', end: '2026-10-11T10:30:00Z' }; await confirmSlot('task-id', 2, slot); expect(JSON.parse(requests[1].data)).toEqual({ slotIndex: 2, ...slot });
    });
    it('posts a body when confirming memory and keeps chat cursors', async () => {
        await decideCandidate('candidate', 'confirm'); expect(JSON.parse(requests[0].data)).toEqual({});
        await askSteza('С чего начать?'); expect(requests[1].url).toBe('/chat/messages');
        await chatHistory('older'); expect(requests[2].params.cursor).toBe('older');
    });
    it('submits onboarding once with server field names and timezone', async () => {
        await completeOnboarding({ role: 'Разработчик', takeOn: ['tasks'], timezone: 'Europe/Moscow' });
        expect(requests[0].url).toBe('/onboarding'); expect(JSON.parse(requests[0].data)).toEqual({ role: 'Разработчик', takeOn: ['tasks'], timezone: 'Europe/Moscow' });
    });
    it('clears expired sessions, but keeps them for a server outage', async () => {
        setToken('session');
        const fail = (status: number) => { apiClient.defaults.adapter = async config => { throw new AxiosError('failure', 'ERR_BAD_RESPONSE', config, undefined, { data: { code: 'internal' }, status, statusText: '', headers: {}, config }); }; };
        fail(503); await expect(getMe()).rejects.toThrow(); expect(getToken()).toBe('session');
        fail(401); await expect(getMe()).rejects.toThrow(); expect(getToken()).toBeNull();
    });
    it('translates problem-details error codes', () => {
        const error = new AxiosError('failure', undefined, undefined, undefined, { data: { code: 'consent_required' }, status: 409, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig });
        expect(apiError(error)).toContain('согласие');
    });
});
