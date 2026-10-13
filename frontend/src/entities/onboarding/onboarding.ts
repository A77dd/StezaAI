import { apiClient } from '@/shared/api/client';
export interface OnboardingPayload { role: string; takeOn: ('tasks' | 'agreements' | 'results' | 'growth')[]; timezone: string }
export const completeOnboarding = async (payload: OnboardingPayload): Promise<void> => { await apiClient.post('/onboarding', payload); };
