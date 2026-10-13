import type { NextAction } from './contracts';

export function nextActionPath(step: NonNullable<NextAction['step']>): string {
    if (step.kind === 'review_candidates' || step.kind === 'commitment') return '/profile#memory';
    return step.target.taskId ? `/tasks?task=${encodeURIComponent(step.target.taskId)}` : '/tasks';
}
