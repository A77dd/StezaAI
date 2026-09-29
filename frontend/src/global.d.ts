// src/types/global.d.ts

// CSS Modules (с .module.css)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Обычные CSS файлы - импортируются как пустой объект для совместимости
declare module '*.css' {
  const content: { readonly [key: string]: string };
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}

// SCSS
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.scss' {
  const content: { readonly [key: string]: string };
  export default content;
}

// Изображения
declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.webp' {
  const content: string;
  export default content;
}

// Видео
declare module '*.mp4' {
  const src: string;
  export default src;
}

declare module '*.webm' {
  const src: string;
  export default src;
}

// Vite env
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_LOCAL_PREVIEW_AUTH_BYPASS?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite ?raw импорты
declare module '*?raw' {
  const content: string;
  export default content;
}
