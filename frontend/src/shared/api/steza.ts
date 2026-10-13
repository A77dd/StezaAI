import { apiClient } from './client';
import type { Task, DraftResult, PlanningResult, ConfirmResult, Slot, NextSlots, Settings, Consent, Profile, Capture, ChatReply, ChatHistory, NextAction } from './contracts';
export type { Task, Slot, PlanningResult } from './contracts';
export async function listTasks(signal?: AbortSignal): Promise<Task[]> {
    const tasks = new Map<string, Task>(); const seen = new Set<string>();
    let cursor: string | null = null;
    do {
        const { data }: { data: { items: Task[]; nextCursor: string | null } } = await apiClient.get('/tasks', { signal, params: { limit: 100, ...(cursor ? { cursor } : {}) } });
        data.items.forEach(task => tasks.set(task.id, task)); cursor = data.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error('Repeated task cursor');
        if (cursor) seen.add(cursor);
    } while (cursor);
    return [...tasks.values()];
}
export const isActive = (task: Pick<Task, 'status'>) => ['inbox', 'proposed', 'scheduled'].includes(task.status);
export const compareTasks = (a: Task, b: Task) => {
    const time = (task: Task) => task.deadline && Number.isFinite(Date.parse(task.deadline)) ? Date.parse(task.deadline) : Infinity;
    const rank = { high: 0, normal: 1, low: 2 };
    return time(a) - time(b) || rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id);
};
export const completeTask = async (task: Task) => {
    if (task.status !== 'scheduled' || !task.bookingId) throw new Error('Only scheduled tasks support check-in');
    return (await apiClient.post<{ task: Task }>(`/tasks/${task.id}/check-in`, { outcome: 'done' })).data.task;
};
export const createTask = async (text: string) => (await apiClient.post<PlanningResult>('/tasks/from-text', { text })).data;
export const chooseDraft = async (id: string, kind: 'task' | 'meeting' | 'reminder' | 'follow_up' | 'info') => (await apiClient.post<DraftResult>(`/drafts/${id}/choose`, { kind })).data;
export const nextSlots = async (id: string) => (await apiClient.post<NextSlots>(`/tasks/${id}/next-slots`)).data;
export const confirmSlot = async (id: string, slotIndex: number, slot: Slot) => (await apiClient.post<ConfirmResult>(`/tasks/${id}/confirm-slot`, { slotIndex, ...slot })).data;
export const getSettings = async () => (await apiClient.get<Settings>('/me/settings')).data;
export const saveTimezone = async (timezone: string) => (await apiClient.patch<Settings>('/me/settings', { timezone })).data;
export const getConsent = async () => (await apiClient.get<Consent>('/me/consent')).data;
export const giveConsent = async (version: string) => (await apiClient.post<Consent>('/me/consent', { version })).data;
export const getProfile = async () => (await apiClient.get<Profile>('/me/profile')).data;
export const capture = async (text: string) => (await apiClient.post<Capture>('/capture', { text, kind: 'note' })).data;
export const decideCandidate = async (id: string, decision: 'confirm' | 'reject') => { await apiClient.post(`/memory/candidates/${id}/${decision}`, decision === 'confirm' ? {} : undefined); };
export const askSteza = async (text: string) => (await apiClient.post<ChatReply>('/chat/messages', { text })).data;
export const chatHistory = async (cursor?: string) => (await apiClient.get<ChatHistory>('/chat/history', { params: { limit: 20, ...(cursor ? { cursor } : {}) } })).data;
export const nextAction = async (signal?: AbortSignal) => (await apiClient.get<NextAction>('/next-action', { signal })).data;
