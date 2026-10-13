import { apiClient } from './client';
import type { Task, TaskPatch, UpdateTaskResult, CancelTaskResult, CheckInInput, CheckInResult, PendingCheckIns, Settings, SettingsPatch, Calendar, Fact, FactInput, Facts, FactHistory } from './contracts';

const idPath = (id: string) => encodeURIComponent(id);
export const getTask = async (id: string) => (await apiClient.get<Task>(`/tasks/${idPath(id)}`)).data;
export const updateTask = async (id: string, input: TaskPatch) => (await apiClient.patch<UpdateTaskResult>(`/tasks/${idPath(id)}`, input)).data;
export const cancelTask = async (id: string) => (await apiClient.post<CancelTaskResult>(`/tasks/${idPath(id)}/cancel`)).data;
export const checkIn = async (id: string, input: CheckInInput) => (await apiClient.post<CheckInResult>(`/tasks/${idPath(id)}/check-in`, input)).data;
export const pendingCheckIns = async () => (await apiClient.get<PendingCheckIns>('/check-ins/pending')).data;
export const updateSettings = async (input: SettingsPatch) => {
    const data = (await apiClient.patch<Settings>('/me/settings', input)).data;
    window.dispatchEvent(new Event('steza:settings-updated'));
    return data;
};
export const calendar = async (from: string, to: string) => (await apiClient.get<Calendar>('/calendar', { params: { from, to } })).data;
export const factsPage = async (cursor?: string, includeExpired = false) => (await apiClient.get<Facts>('/memory/facts', { params: { limit: 50, ...(cursor ? { cursor } : {}), ...(includeExpired ? { include: 'expired' } : {}) } })).data;
export const declareFact = async (input: FactInput) => (await apiClient.post<Fact>('/memory/facts', input)).data;
export const editFact = async (id: string, statement: string) => (await apiClient.patch<Fact>(`/memory/facts/${idPath(id)}`, { statement })).data;
export const deleteFact = async (id: string) => { await apiClient.delete(`/memory/facts/${idPath(id)}`); };
export const factHistory = async (id: string) => (await apiClient.get<FactHistory>(`/memory/facts/${idPath(id)}/history`)).data;
export const clearChat = async () => { await apiClient.delete('/chat/history'); };
export const exportAccount = async () => (await apiClient.get<Blob>('/me/export', { responseType: 'blob' })).data;
export const deleteAccount = async () => { await apiClient.delete('/me'); };
