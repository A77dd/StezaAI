import { describe, expect, it } from 'vitest';
import { dayKey, shiftDay } from '../library/planningTime';
import { nextActionPath } from './navigation';
import type { NextAction } from './contracts';

describe('planning timezone', () => {
    it('groups the same instant by the selected timezone, not the host day', () => {
        const instant = new Date('2026-12-31T22:30:00Z');
        expect(dayKey(instant, 'Europe/Moscow')).toBe('2027-01-01');
        expect(dayKey(instant, 'America/New_York')).toBe('2026-12-31');
    });
    it('advances calendar days across DST and year boundaries', () => {
        expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09');
        expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    });
});

describe('next action destinations', () => {
    const step = (kind: NonNullable<NextAction['step']>['kind']) => ({ kind, target: { taskId: 'task-123', factId: null } } as NonNullable<NextAction['step']>);
    it('opens the specific task for planning or check-in', () => {
        expect(nextActionPath(step('plan_task'))).toBe('/tasks?task=task-123');
        expect(nextActionPath(step('check_in'))).toBe('/tasks?task=task-123');
    });
    it('opens memory for facts and candidate review', () => {
        expect(nextActionPath(step('commitment'))).toBe('/profile#memory');
        expect(nextActionPath(step('review_candidates'))).toBe('/profile#memory');
    });
});
