import { beforeEach, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import { updateTask, cancelTask, checkIn, updateSettings, calendar, factsPage, declareFact, editFact, deleteFact, factHistory, clearChat, exportAccount, deleteAccount } from './manage';

let requests: InternalAxiosRequestConfig[];
beforeEach(() => {
    requests = [];
    vi.stubGlobal('localStorage', { getItem: () => 'test-session' });
    vi.stubGlobal('window', new EventTarget());
    apiClient.defaults.adapter = async config => { requests.push(config); return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; };
});

it('preserves partial task edits and explicit removal of a deadline', async () => {
    await updateTask('task/1', { title: 'Новый заголовок', deadline: null });
    expect(requests[0].method).toBe('patch'); expect(requests[0].url).toBe('/tasks/task%2F1');
    expect(JSON.parse(requests[0].data)).toEqual({ title: 'Новый заголовок', deadline: null });
    await cancelTask('task-1'); expect(requests[1].url).toBe('/tasks/task-1/cancel'); expect(requests[1].method).toBe('post');
});

it('sends check-in reasons and results without treating them as status patches', async () => {
    await checkIn('task-1', { outcome: 'needs_time', reason: 'not_enough_time', result: 'Черновик готов' });
    expect(requests[0].url).toBe('/tasks/task-1/check-in');
    expect(JSON.parse(requests[0].data)).toEqual({ outcome: 'needs_time', reason: 'not_enough_time', result: 'Черновик готов' });
});

it('notifies time consumers only after settings are saved', async () => {
    const listener = vi.fn(); window.addEventListener('steza:settings-updated', listener);
    const input = { workingHours: { isoDays: [1, 3, 5], start: '09:00', end: '18:00' }, notificationIntensity: 'low' as const };
    await updateSettings(input); expect(JSON.parse(requests[0].data)).toEqual(input); expect(listener).toHaveBeenCalledOnce();
    apiClient.defaults.adapter = async () => { throw new Error('network'); };
    await expect(updateSettings(input)).rejects.toThrow(); expect(listener).toHaveBeenCalledOnce();
});

it('keeps calendar timestamps and paginated memory filters intact', async () => {
    await calendar('2026-10-13T00:00:00Z', '2026-10-20T00:00:00Z');
    expect(requests[0].params).toEqual({ from: '2026-10-13T00:00:00Z', to: '2026-10-20T00:00:00Z' });
    await factsPage('older-page', true); expect(requests[1].params).toEqual({ limit: 50, cursor: 'older-page', include: 'expired' });
});

it('uses dedicated endpoints for memory lifecycle and history', async () => {
    await declareFact({ kind: 'goal', statement: 'Изучить TypeScript' }); await editFact('fact-1', 'Изучить React'); await factHistory('fact-1'); await deleteFact('fact-1');
    expect(requests.map(r => [r.method, r.url])).toEqual([['post', '/memory/facts'], ['patch', '/memory/facts/fact-1'], ['get', '/memory/facts/fact-1/history'], ['delete', '/memory/facts/fact-1']]);
    expect(JSON.parse(requests[1].data)).toEqual({ statement: 'Изучить React' });
});

it('exports an authenticated download and separates chat/account deletion', async () => {
    await exportAccount(); expect(requests[0].responseType).toBe('blob'); expect(requests[0].headers.Authorization).toBe('Bearer test-session');
    await clearChat(); await deleteAccount();
    expect(requests.slice(1).map(r => [r.method, r.url])).toEqual([['delete', '/chat/history'], ['delete', '/me']]);
});
