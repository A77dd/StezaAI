// src/shared/utils/validateImage.ts

export interface ImageValidationResult {
    valid: boolean;
    error?: string;
    width?: number;
    height?: number;
}

export const MIN_IMAGE_SIZE = 400;

/**
 * Проверяет размеры изображения (ширину и высоту).
 * @param file - файл изображения
 * @param minWidth - минимальная ширина (по умолчанию 400)
 * @param minHeight - минимальная высота (по умолчанию 400)
 */
export const validateImageSize = (
    file: File,
    minWidth = MIN_IMAGE_SIZE,
    minHeight = MIN_IMAGE_SIZE,
): Promise<ImageValidationResult> => {
    return new Promise((resolve) => {
        // 1. Проверяем тип файла
        if (!file.type.startsWith('image/')) {
            return resolve({
                valid: false,
                error: 'Файл не является изображением',
            });
        }

        // 2. Загружаем изображение для проверки размеров
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const { width, height } = img;

            if (width < minWidth || height < minHeight) {
                return resolve({
                    valid: false,
                    error: `Минимальный размер изображения — ${minWidth}×${minHeight}px. Ваше изображение: ${width}×${height}px`,
                    width,
                    height,
                });
            }

            resolve({ valid: true, width, height });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({
                valid: false,
                error: 'Не удалось прочитать изображение',
            });
        };

        img.src = url;
    });
};

/**
 * Проверяет несколько файлов сразу.
 * Возвращает массив ошибок (пустой, если всё ок).
 */
export const validateImagesSize = async (
    files: File[],
    minWidth = MIN_IMAGE_SIZE,
    minHeight = MIN_IMAGE_SIZE,
): Promise<{ valid: boolean; errors: string[]; results: ImageValidationResult[] }> => {
    const results = await Promise.all(
        files.map((file) => validateImageSize(file, minWidth, minHeight))
    );

    const errors: string[] = [];
    results.forEach((result, index) => {
        if (!result.valid) {
            errors.push(`${files[index].name}: ${result.error}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        results,
    };
};