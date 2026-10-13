import type { Fact } from '@/shared/api/contracts';
export const FACT_KIND_LABELS: Record<Fact['kind'], string> = {
    role: 'Роль',
    goal: 'Цель',
    strength: 'Сильная сторона',
    growth_area: 'Зона развития',
    skill: 'Навык',
    project: 'Проект',
    commitment: 'Обещание',
    work_result: 'Результат работы',
    method: 'Метод',
    artifact: 'Материал',
    preference: 'Предпочтение',
};
