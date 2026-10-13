import type { Task } from '@/shared/api/contracts';
export const TASK_STATUS_LABELS: Record<Task['status'], string> = {
    inbox: 'Входящие',
    proposed: 'Выбираем время',
    scheduled: 'Запланировано',
    done: 'Выполнено',
    cancelled: 'Отменено',
};
export const TASK_KIND_LABELS: Record<Task['kind'], string> = {
    task: 'Задача',
    meeting: 'Встреча',
    reminder: 'Напоминание',
    follow_up: 'Вернуться к вопросу',
    info: 'Информация',
};
