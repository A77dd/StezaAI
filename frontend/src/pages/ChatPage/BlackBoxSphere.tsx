import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Tweakpane from 'tweakpane';
import { shouldAnimateScene } from './sceneAnimation';

// Glass Spinner Lab: WebGL2 metaball SDF + glass optics (из референса).
// Сцена — фон всей страницы: точечный паттерн, текст вопроса и кнопка «+» лежат за каплей.
// Два состояния заданы пресетами (rest/thinking) и плавно перетекают друг в друга по фазе чата.
// Tweakpane — только отладка: открыть ?sphere-debug=1, скрыть ?sphere-debug=0.

export type SpherePhase = 'idle' | 'processing' | 'result';

const QUESTION_TEXT = 'Над чем сейчас работаешь?';
const THINKING_TEXT = 'Думаю...';

// t-stagger / t-shimmer (transitions.dev) — тайминги в ms
const STAGGER_DUR = 500;
const STAGGER_DISTANCE = 12;
const STAGGER_STAGGER = 40;
const STAGGER_BLUR = 3;
const CONTENT_EXIT_DUR = 200;
const SHIMMER_DUR = 2000;

// cubic-bezier(0.22, 1, 0.36, 1)
const easeOutBezier = (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const p1x = 0.22;
    const p1y = 1;
    const p2x = 0.36;
    const p2y = 1;
    const cx = 3 * p1x;
    const bx = 3 * (p2x - p1x) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * p1y;
    const by = 3 * (p2y - p1y) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
    let t = x;
    for (let i = 0; i < 6; i++) {
        const err = sampleX(t) - x;
        if (Math.abs(err) < 1e-5) break;
        const d = sampleDX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
    }
    return ((ay * t + by) * t + cy) * t;
};
const PLUS_OFFSET_PX = 42; // центр кнопки «+» ниже центра сцены, CSS px — прямо под текстом
const PLUS_RADIUS_PX = 23; // радиус кнопки «+», CSS px

const PARAMS = {
    // Dot pattern — общий для обоих состояний; масштабируется под ширину экрана
    dotSpacing: 19,
    dotRadius: 1,
    dotOpacity: 0.18,

    // Виньетка по краям сцены: сила (плотность у края) и протяжённость градиента
    vignetteStrong: 1.0,
    vignetteStrongReach: 0.5,
    vignetteSoft: 1.0,
    vignetteSoftReach: 0.5,

    // Формат сцены: фиксированный, тема не меняется сама.
    // 'auto' (переключение по фазе чата) доступен вручную в отладочной панели.
    format: 'dark',

    // Общий масштаб бабла (сцена только для мобильных)
    blobScale: 0.7,
};

type SceneStateKey = 'rest' | 'thinking';

type SceneState = {
    orbitRadius: number;
    rotationSpeed: number;
    mergePhase: number;
    magnetism: number;
    dropRadius: number;
    dropElongation: number;
    metaballThreshold: number;
    refraction: number;
    dispersion: number;
    specular: number;
    glossiness: number;
    fresnelDark: number;
    tintOpacity: number;
    blur: number;
    glowIntensity: number;
    mouseMass: number;
    enableClickRipple: boolean;
    rippleIntensity: number;
};

// rest — состояние покоя (idle/result), thinking — размышление (processing)
const STATE_PRESETS: Record<SceneStateKey, SceneState> = {
    rest: {
        orbitRadius: 30,
        rotationSpeed: 0.10,
        mergePhase: 0.12,
        magnetism: 1.0,
        dropRadius: 75,
        dropElongation: 1.10,
        metaballThreshold: 0.5,
        refraction: 0.16,
        dispersion: 0.03,
        specular: 0.4,
        glossiness: 120,
        fresnelDark: 0.25,
        tintOpacity: 0.06,
        blur: 0,
        glowIntensity: 1,
        mouseMass: 0,
        enableClickRipple: false,
        rippleIntensity: 0.0,
    },
    thinking: {
        orbitRadius: 116,
        rotationSpeed: 0.60,
        mergePhase: 0.23,
        magnetism: 1.0,
        dropRadius: 70,
        dropElongation: 1.10,
        metaballThreshold: 0.5,
        refraction: 0.11,
        dispersion: 0.04,
        specular: 0.8,
        glossiness: 120,
        fresnelDark: 1.0,
        tintOpacity: 0.06,
        blur: 0,
        glowIntensity: 1,
        mouseMass: 0,
        enableClickRipple: false,
        rippleIntensity: 0.6,
    },
};

const STATE_NUMERIC_KEYS = [
    'orbitRadius',
    'rotationSpeed',
    'mergePhase',
    'magnetism',
    'dropRadius',
    'dropElongation',
    'metaballThreshold',
    'refraction',
    'dispersion',
    'specular',
    'glossiness',
    'fresnelDark',
    'tintOpacity',
    'blur',
    'glowIntensity',
    'mouseMass',
    'rippleIntensity',
] as const;

type SceneFormat = 'dark' | 'light';

// Переопределения оптики для светлого профиля — в любом состоянии
const LIGHT_FRESNEL_DARK = 0.55;
const LIGHT_TINT_OPACITY = 0;

// Дыхание орбиты в размышлении: отклонение до 50% и обратно
const THINKING_BREATH_DEVIATION = 0.5;
const THINKING_BREATH_PERIOD = 4;

const SCENE_FORMATS: Record<SceneFormat, { bg: number[]; dot: number[]; text: number[] }> = {
    dark: {
        bg: [8, 10, 16],
        dot: [255, 255, 255],
        text: [245, 245, 247],
    },
    light: {
        bg: [251, 251, 253],
        dot: [17, 17, 17],
        text: [17, 17, 17],
    },
};

const VERT_SRC = `#version 300 es
  in vec2 a_pos;
  out vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `#version 300 es
  precision highp float;

  uniform sampler2D u_bg;
  uniform vec2  u_res;
  uniform float u_time;

  // 3 droplets: xy = center (px), z = radius, w = elongation
  uniform vec4  u_drops[3];
  uniform float u_threshold;

  // Mouse interaction
  uniform vec2  u_mouse;
  uniform float u_mouseMass;

  // Ripple interaction
  uniform vec2  u_ripplePos;
  uniform float u_rippleTime;
  uniform float u_rippleIntensity;
  uniform bool  u_enableRipple;

  // Glass optics
  uniform float u_refraction;
  uniform float u_dispersion;
  uniform float u_specular;
  uniform float u_glossiness;
  uniform float u_fresnelDark;
  uniform float u_tintOpacity;
  uniform float u_glow;

  in vec2 v_uv;
  out vec4 fragColor;

  // Signed distance for an elongated ellipse (teardrop approximation)
  float dropSDF(vec2 p, vec2 center, float r, float elongation) {
    vec2 q = p - center;
    // Stretch Y axis -> teardrop / elongated drop shape
    q.y /= elongation;
    return length(q) / r;
  }

  // Metaball potential field (sum of 1/sdf^2)
  float metafield(vec2 p) {
    float f = 0.0;
    for (int i = 0; i < 3; i++) {
      float d = dropSDF(p, u_drops[i].xy, u_drops[i].z, u_drops[i].w);
      f += 1.0 / max(d * d, 0.0001);
    }

    // Add mouse influence if active and within range
    if (abs(u_mouseMass) > 0.001) {
      float dMouse = length(p - u_mouse) / 40.0; // scale of mouse field
      f += u_mouseMass / max(dMouse * dMouse, 0.0001);
    }

    // Ripple influence (Dispersion & Wave)
    if (u_enableRipple && u_rippleTime >= 0.0) {
      float dist = length(p - u_ripplePos);
      float radius = u_rippleTime * 600.0; // wave speed
      float width = 120.0; // width of wave pulse

      float damping = max(0.0, 1.0 - u_rippleTime / 2.0); // fades over 2 seconds

      // Negative well at the impact center to break tension
      float hole = exp(-dist * 0.015) * max(0.0, 1.0 - u_rippleTime * 2.0) * u_rippleIntensity * 0.4;
      f -= hole;

      if (abs(dist - radius) < width) {
        float envelope = smoothstep(width, 0.0, abs(dist - radius));
        float wave = sin((dist - radius) * 0.15) * envelope * damping;
        f += wave * u_rippleIntensity * 0.05;
      }
    }

    return f;
  }

  // Estimate surface normal via central differences on the potential field
  vec3 metaNormal(vec2 p) {
    float eps = 1.5;
    float dx = metafield(p + vec2(eps, 0.0)) - metafield(p - vec2(eps, 0.0));
    float dy = metafield(p + vec2(0.0, eps)) - metafield(p - vec2(0.0, eps));
    // Convert gradient to a hemisphere normal
    vec2 grad = normalize(vec2(dx, dy));
    float field = metafield(p);
    float nz = clamp((field - u_threshold) * 0.6, 0.0, 1.0);
    return normalize(vec3(grad * (1.0 - nz), nz + 0.2));
  }

  void main() {
    vec2 px  = gl_FragCoord.xy;
    vec2 uv  = px / u_res;

    float field = metafield(px);
    bool inside = field >= u_threshold;

    vec2 texUV = uv;
    vec3 bgColor = texture(u_bg, texUV).rgb * (0.4 + u_glow * 0.6);

    if (!inside) {
      fragColor = vec4(bgColor, 1.0);
      return;
    }

    // --- Normal for lighting & refraction ---
    vec3 N = metaNormal(px);

    // --- Chromatic aberration refraction ---
    float baseIor = 1.0 + u_refraction;
    float iorR = baseIor - u_dispersion * 0.5;
    float iorG = baseIor;
    float iorB = baseIor + u_dispersion * 0.5;

    vec3 I = vec3(0.0, 0.0, -1.0);
    vec3 refR = refract(I, N, 1.0/iorR);
    vec3 refG = refract(I, N, 1.0/iorG);
    vec3 refB = refract(I, N, 1.0/iorB);

    vec2 uvR = uv - refR.xy * u_refraction;
    vec2 uvG = uv - refG.xy * u_refraction;
    vec2 uvB = uv - refB.xy * u_refraction;

    float r = texture(u_bg, uvR).r;
    float g = texture(u_bg, uvG).g;
    float b = texture(u_bg, uvB).b;
    vec3 color = vec3(r, g, b) * (0.4 + u_glow * 0.6);

    // --- Lighting ---
    vec3 L = normalize(vec3(-0.5, 1.0, 1.5));
    float spec   = pow(max(dot(N, L), 0.0), u_glossiness) * u_specular;
    float fresnel = pow(1.0 - N.z, 4.0);

    color = mix(color, vec3(1.0), spec);
    color = mix(color, vec3(0.0), fresnel * u_fresnelDark);
    color += vec3(u_tintOpacity);

    // Soft edge fade at metaball boundary
    float edgeFade = smoothstep(u_threshold, u_threshold * 1.08, field);
    fragColor = vec4(mix(bgColor, color, edgeFade), 1.0);
  }
`;

const compileShader = (gl: WebGL2RenderingContext, type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('BlackBoxSphere: failed to create shader');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`BlackBoxSphere: shader compilation failed: ${log ?? 'unknown'}`);
    }
    return shader;
};

const isDebugPaneEnabled = () => {
    const requested = new URLSearchParams(window.location.search).get('sphere-debug');
    if (requested === null) return localStorage.getItem('sphereDebug') === '1';
    const enabled = requested !== '0';
    localStorage.setItem('sphereDebug', enabled ? '1' : '0');
    return enabled;
};

const addStateInputs = (folder: Tweakpane.FolderApi, state: SceneState) => {
    folder.addInput(state, 'orbitRadius', { min: 30, max: 160, step: 1, label: 'Orbit Radius' });
    folder.addInput(state, 'rotationSpeed', { min: 0.1, max: 3, step: 0.05, label: 'Speed (rps)' });
    folder.addInput(state, 'mergePhase', { min: 0, max: 1, step: 0.01, label: 'Merge Phase' });
    folder.addInput(state, 'magnetism', { min: 0, max: 1, step: 0.01, label: 'Magnetism' });
    folder.addInput(state, 'dropRadius', { min: 20, max: 100, step: 1, label: 'Drop Size' });
    folder.addInput(state, 'dropElongation', { min: 1, max: 1.1, step: 0.01, label: 'Elongation' });
    folder.addInput(state, 'metaballThreshold', { min: 0.2, max: 1, step: 0.01, label: 'Fusion' });
    folder.addInput(state, 'refraction', { min: 0, max: 0.3, step: 0.01, label: 'Bending' });
    folder.addInput(state, 'dispersion', { min: 0, max: 0.5, step: 0.01, label: 'Dispersion' });
    folder.addInput(state, 'specular', { min: 0, max: 3, step: 0.1, label: 'Specular' });
    folder.addInput(state, 'glossiness', { min: 10, max: 120, step: 1, label: 'Gloss' });
    folder.addInput(state, 'fresnelDark', { min: 0, max: 1, step: 0.05, label: 'Edge Shadow' });
    folder.addInput(state, 'tintOpacity', { min: 0, max: 0.3, step: 0.01, label: 'Tint' });
    folder.addInput(state, 'blur', { min: 0, max: 40, step: 1, label: 'Blur (px)' });
    folder.addInput(state, 'glowIntensity', { min: 0, max: 2, step: 0.05, label: 'Brightness' });
    folder.addInput(state, 'mouseMass', { min: -0.5, max: 1, step: 0.01, label: 'Mouse Mass' });
    folder.addInput(state, 'enableClickRipple', { label: 'Click Ripple' });
    folder.addInput(state, 'rippleIntensity', { min: 0, max: 3, step: 0.1, label: 'Ripple Force' });
};

export const BlackBoxSphere = ({ phase, onPlusClick }: { phase: SpherePhase; onPlusClick: () => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phaseRef = useRef<SpherePhase>(phase);
    const onPlusClickRef = useRef(onPlusClick);
    const requestFrameRef = useRef<() => void>(() => undefined);

    useEffect(() => {
        phaseRef.current = phase;
        requestFrameRef.current();
    }, [phase]);

    useEffect(() => {
        onPlusClickRef.current = onPlusClick;
    }, [onPlusClick]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('BlackBoxSphere: canvas element is missing');

        const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
        if (!gl) throw new Error('BlackBoxSphere: WebGL2 is required');

        const prog = gl.createProgram();
        if (!prog) throw new Error('BlackBoxSphere: failed to create program');
        gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
        gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(prog);
            throw new Error(`BlackBoxSphere: program link failed: ${log ?? 'unknown'}`);
        }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        if (!buf) throw new Error('BlackBoxSphere: failed to create buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const uBg = gl.getUniformLocation(prog, 'u_bg');
        const uRes = gl.getUniformLocation(prog, 'u_res');
        const uTime = gl.getUniformLocation(prog, 'u_time');
        const uDrops = gl.getUniformLocation(prog, 'u_drops');
        const uThreshold = gl.getUniformLocation(prog, 'u_threshold');
        const uRefraction = gl.getUniformLocation(prog, 'u_refraction');
        const uDispersion = gl.getUniformLocation(prog, 'u_dispersion');
        const uSpecular = gl.getUniformLocation(prog, 'u_specular');
        const uGlossiness = gl.getUniformLocation(prog, 'u_glossiness');
        const uFresnel = gl.getUniformLocation(prog, 'u_fresnelDark');
        const uTint = gl.getUniformLocation(prog, 'u_tintOpacity');
        const uGlow = gl.getUniformLocation(prog, 'u_glow');
        const uMouse = gl.getUniformLocation(prog, 'u_mouse');
        const uMouseMass = gl.getUniformLocation(prog, 'u_mouseMass');
        const uRipplePos = gl.getUniformLocation(prog, 'u_ripplePos');
        const uRippleTime = gl.getUniformLocation(prog, 'u_rippleTime');
        const uRippleInt = gl.getUniformLocation(prog, 'u_rippleIntensity');
        const uEnableRipple = gl.getUniformLocation(prog, 'u_enableRipple');

        // Координаты канваса в device px: canvas-local, Y — снизу вверх (как в WebGL)
        const toCanvasPx = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio;
            return {
                x: (clientX - rect.left) * dpr,
                y: (rect.height - (clientY - rect.top)) * dpr,
            };
        };

        let mx = -1000;
        let my = -1000;
        const onPointerMove = (event: PointerEvent) => {
            const p = toCanvasPx(event.clientX, event.clientY);
            mx = p.x;
            my = p.y;
        };
        const onPointerLeave = () => {
            mx = -1000;
            my = -1000;
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerleave', onPointerLeave);

        let rippleX = -1000;
        let rippleY = -1000;
        let rippleStart = -1;

        // Текущие цвета сцены и параметры состояния — интерполируются каждый кадр
        const sceneColors = {
            bg: [...SCENE_FORMATS.dark.bg],
            dot: [...SCENE_FORMATS.dark.dot],
            text: [...SCENE_FORMATS.dark.text],
        };
        const stateCurrent: SceneState = { ...STATE_PRESETS.rest };

        // Контент сцены: текущий текст и таймлайн смены
        // (quiet-fade 200ms → stagger-вход 500ms + 40ms на строку)
        const sceneState = {
            text: QUESTION_TEXT,
            pendingText: null as string | null,
            hideUntil: 0,
            shownAt: performance.now(),
            shimmerEpoch: 0,
        };

        // Сцена за каплей: рисуется в 2D-канвас и отдаётся шейдеру текстурой
        const tex = gl.createTexture();
        if (!tex) throw new Error('BlackBoxSphere: failed to create texture');
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const sceneCanvas = document.createElement('canvas');
        const sceneCtx = sceneCanvas.getContext('2d');
        if (!sceneCtx) throw new Error('BlackBoxSphere: 2D context is required');

        const channelsToCss = (channels: number[], alpha?: number) => {
            const [r, g, b] = channels.map((value) => Math.round(value));
            return alpha === undefined
                ? `rgb(${r}, ${g}, ${b})`
                : `rgba(${r}, ${g}, ${b}, ${(alpha).toFixed(3)})`;
        };

        const drawScene = () => {
            const nowMs = performance.now();
            sceneCanvas.width = canvas.width;
            sceneCanvas.height = canvas.height;
            const w = canvas.width;
            const h = canvas.height;
            sceneCtx.fillStyle = channelsToCss(sceneColors.bg);
            sceneCtx.fillRect(0, 0, w, h);

            // Точки адаптивны: плотность нормирована к базовой ширине 390px
            const dpr = window.devicePixelRatio;
            const mobileFit = Math.min(1.25, Math.max(0.85, canvas.clientWidth / 390));
            const pitch = PARAMS.dotSpacing * mobileFit * dpr;
            const dotRadius = PARAMS.dotRadius * mobileFit * dpr;
            sceneCtx.fillStyle = channelsToCss(sceneColors.dot, PARAMS.dotOpacity);
            for (let y = pitch * 0.5; y < h + pitch; y += pitch) {
                for (let x = pitch * 0.5; x < w + pitch; x += pitch) {
                    sceneCtx.beginPath();
                    sceneCtx.arc(x, y, dotRadius, 0, Math.PI * 2);
                    sceneCtx.fill();
                }
            }

            // Виньетка: тёмная версия затемняет, светлая — забеляет; сверху/снизу сильнее
            const drawVignette = (x0: number, y0: number, x1: number, y1: number, alpha: number) => {
                const gradient = sceneCtx.createLinearGradient(x0, y0, x1, y1);
                gradient.addColorStop(0, channelsToCss(sceneColors.bg, alpha));
                gradient.addColorStop(1, channelsToCss(sceneColors.bg, 0));
                sceneCtx.fillStyle = gradient;
                sceneCtx.fillRect(0, 0, w, h);
            };
            drawVignette(0, 0, 0, h * PARAMS.vignetteStrongReach, PARAMS.vignetteStrong);
            drawVignette(0, h, 0, h * (1 - PARAMS.vignetteStrongReach), PARAMS.vignetteStrong);
            drawVignette(0, 0, w * PARAMS.vignetteSoftReach, 0, PARAMS.vignetteSoft);
            drawVignette(w, 0, w * (1 - PARAMS.vignetteSoftReach), 0, PARAMS.vignetteSoft);

            // Кнопка «+» — в сцене, под каплей; живёт вместе с вопросом
            const hiding = sceneState.hideUntil > 0;
            const exitAlpha = hiding
                ? (() => {
                    const t = Math.min(1, Math.max(0, (sceneState.hideUntil - nowMs) / CONTENT_EXIT_DUR));
                    return t * t * (3 - 2 * t);
                })()
                : 1;
            const questionShown = sceneState.text === QUESTION_TEXT;
            let plusAlpha = 0;
            if (questionShown) {
                plusAlpha = hiding
                    ? exitAlpha
                    : easeOutBezier(Math.min(1, Math.max(0, (nowMs - sceneState.shownAt) / STAGGER_DUR)));
            }
            if (plusAlpha > 0.01) {
                const plusY = h / 2 + PLUS_OFFSET_PX * dpr;
                sceneCtx.strokeStyle = channelsToCss(sceneColors.text, 0.55 * plusAlpha);
                sceneCtx.lineWidth = 1.5 * dpr;
                sceneCtx.beginPath();
                sceneCtx.arc(w / 2, plusY, PLUS_RADIUS_PX * dpr, 0, Math.PI * 2);
                sceneCtx.stroke();
                const arm = 9 * dpr;
                sceneCtx.strokeStyle = channelsToCss(sceneColors.text, 0.9 * plusAlpha);
                sceneCtx.lineWidth = 1.8 * dpr;
                sceneCtx.lineCap = 'round';
                sceneCtx.beginPath();
                sceneCtx.moveTo(w / 2 - arm, plusY);
                sceneCtx.lineTo(w / 2 + arm, plusY);
                sceneCtx.moveTo(w / 2, plusY - arm);
                sceneCtx.lineTo(w / 2, plusY + arm);
                sceneCtx.stroke();
            }

            // Текст: stagger-вход (сдвиг + блюр + задержка на строку), тихий уход 200ms
            const drawText = (text: string, nowMs: number) => {
                const fontSize = Math.round(Math.min(15, Math.max(10, canvas.clientWidth * 0.032)) * dpr);
                sceneCtx.font = `520 ${fontSize}px "Suisse Intl", Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
                const ctxWithSpacing = sceneCtx as CanvasRenderingContext2D & { letterSpacing?: string };
                if ('letterSpacing' in ctxWithSpacing) {
                    ctxWithSpacing.letterSpacing = `${(-0.025 * fontSize).toFixed(1)}px`;
                }
                sceneCtx.textAlign = 'center';
                sceneCtx.textBaseline = 'middle';

                const maxWidth = w * 0.88;
                const lines: string[] = [];
                let current = '';
                for (const word of text.split(' ')) {
                    const candidate = current ? `${current} ${word}` : word;
                    if (sceneCtx.measureText(candidate).width > maxWidth && current) {
                        lines.push(current);
                        current = word;
                    } else {
                        current = candidate;
                    }
                }
                if (current) lines.push(current);

                const lineHeight = Math.round(fontSize * 1.25);
                const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;
                const shimmering = text === THINKING_TEXT;
                const shimmerP = sceneState.shimmerEpoch > 0
                    ? ((nowMs - sceneState.shimmerEpoch) / SHIMMER_DUR) % 1
                    : 0;

                lines.forEach((line, index) => {
                    let alpha: number;
                    let dy = 0;
                    let blurPx = 0;
                    if (hiding) {
                        alpha = exitAlpha;
                    } else {
                        const lineT = Math.min(1, Math.max(0, (nowMs - sceneState.shownAt - index * STAGGER_STAGGER) / STAGGER_DUR));
                        const e = easeOutBezier(lineT);
                        alpha = e;
                        dy = (1 - e) * STAGGER_DISTANCE * dpr;
                        blurPx = (1 - e) * STAGGER_BLUR * dpr;
                    }
                    if (alpha <= 0.01) return;

                    const lineY = startY + index * lineHeight;
                    sceneCtx.save();
                    if (blurPx > 0.2) sceneCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
                    sceneCtx.translate(0, dy);

                    if (shimmering) {
                        // База — приглушённый текст
                        sceneCtx.fillStyle = channelsToCss(sceneColors.text, alpha * 0.55);
                        sceneCtx.fillText(line, w / 2, lineY);
                        // Бегущая световая полоса, клип по глифам
                        const lineW = sceneCtx.measureText(line).width;
                        const bandCenter = w / 2 + (0.5 - shimmerP) * 3 * lineW;
                        const gradient = sceneCtx.createLinearGradient(
                            bandCenter - 2 * lineW, 0, bandCenter + 2 * lineW, 0
                        );
                        gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                        gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
                        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
                        gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
                        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        sceneCtx.globalAlpha = alpha;
                        sceneCtx.fillStyle = gradient;
                        sceneCtx.fillText(line, w / 2, lineY);
                        sceneCtx.globalAlpha = 1;
                    } else {
                        sceneCtx.fillStyle = channelsToCss(sceneColors.text, alpha);
                        sceneCtx.fillText(line, w / 2, lineY);
                    }
                    sceneCtx.restore();
                });
            };
            drawText(sceneState.text, nowMs);

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
        };

        drawScene();

        const resize = () => {
            const dpr = window.devicePixelRatio;
            canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
            canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(uRes, canvas.width, canvas.height);
            drawScene();
            requestFrameRef.current();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        // Клик: по кнопке «+» в сцене (когда вопрос на месте) — вызов reset, иначе — ripple
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest('button, a, textarea, input, .tp-dfwv')) return;
            if (sceneState.text === QUESTION_TEXT && !sceneState.pendingText) {
                const rect = canvas.getBoundingClientRect();
                const plusCx = rect.left + rect.width / 2;
                const plusCy = rect.top + rect.height / 2 + PLUS_OFFSET_PX;
                if (Math.hypot(event.clientX - plusCx, event.clientY - plusCy) <= PLUS_RADIUS_PX + 20) {
                    onPlusClickRef.current();
                    return;
                }
            }
            if (!stateCurrent.enableClickRipple) return;
            const p = toCanvasPx(event.clientX, event.clientY);
            rippleX = p.x;
            rippleY = p.y;
            rippleStart = performance.now();
        };
        window.addEventListener('pointerdown', onPointerDown);

        const startTime = performance.now();
        let lastFrame = startTime;
        let appliedFormat: SceneFormat | null = null;
        let breatheAmp = 0;
        let rotationAngle = 0;
        let mergePhaseAccum = 0;
        let rafId = 0;
        let disposed = false;
        let documentVisible = document.visibilityState === 'visible';
        let elementVisible = true;
        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let reducedMotion = reducedMotionQuery.matches;

        const render = () => {
            rafId = 0;
            const now = performance.now();
            const t = (now - startTime) / 1000;
            const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
            lastFrame = now;

            // Формат сцены: ручной выбор или по фазе чата
            const targetFormat: SceneFormat = PARAMS.format === 'auto'
                ? (phaseRef.current === 'result' ? 'light' : 'dark')
                : (PARAMS.format as SceneFormat);
            if (targetFormat !== appliedFormat) {
                appliedFormat = targetFormat;
                document.documentElement.dataset.theme = targetFormat;
            }
            const targetColors = SCENE_FORMATS[targetFormat];
            // Переходы форматов длинные и максимально плавные
            const colorBlend = reducedMotion ? 1 : 1 - Math.exp(-dt * 2);
            let sceneDirty = false;
            const blendChannels = (current: number[], goal: number[]) => {
                for (let i = 0; i < current.length; i++) {
                    current[i] += (goal[i] - current[i]) * colorBlend;
                    if (Math.abs(goal[i] - current[i]) > 0.5) sceneDirty = true;
                }
            };
            blendChannels(sceneColors.bg, targetColors.bg);
            blendChannels(sceneColors.dot, targetColors.dot);
            blendChannels(sceneColors.text, targetColors.text);

            // Параметры состояния: переход в thinking длинный и плавный
            const statePreset = STATE_PRESETS[phaseRef.current === 'processing' ? 'thinking' : 'rest'];
            const stateBlend = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
            const lightProfile = targetFormat === 'light';
            for (const key of STATE_NUMERIC_KEYS) {
                let goal: number = statePreset[key];
                if (key === 'fresnelDark' && lightProfile) goal = LIGHT_FRESNEL_DARK;
                if (key === 'tintOpacity' && lightProfile) goal = LIGHT_TINT_OPACITY;
                stateCurrent[key] += (goal - stateCurrent[key]) * stateBlend;
            }
            stateCurrent.enableClickRipple = statePreset.enableClickRipple;

            // Дыхание орбиты в размышлении: плавное отклонение до 50% и обратно
            const breatheGoal = !reducedMotion && phaseRef.current === 'processing'
                ? THINKING_BREATH_DEVIATION
                : 0;
            breatheAmp += (breatheGoal - breatheAmp) * stateBlend;

            // Смена контента: тихий уход 200ms → stagger-вход; «Думаю...» шиммерит постоянно
            const targetText = phaseRef.current === 'processing' ? THINKING_TEXT : QUESTION_TEXT;
            if (reducedMotion && sceneState.text !== targetText) {
                sceneState.text = targetText;
                sceneState.pendingText = null;
                sceneState.hideUntil = 0;
                sceneState.shownAt = now - STAGGER_DUR - 8 * STAGGER_STAGGER;
                sceneState.shimmerEpoch = 0;
            } else if (sceneState.text !== targetText && sceneState.pendingText !== targetText && !sceneState.hideUntil) {
                sceneState.hideUntil = now + CONTENT_EXIT_DUR;
                sceneState.pendingText = targetText;
            }
            if (sceneState.hideUntil > 0 && now >= sceneState.hideUntil) {
                sceneState.text = sceneState.pendingText as string;
                sceneState.pendingText = null;
                sceneState.hideUntil = 0;
                sceneState.shownAt = now;
                if (sceneState.text === THINKING_TEXT) sceneState.shimmerEpoch = now;
            }
            const contentAnimating = sceneState.hideUntil > 0 ||
                now - sceneState.shownAt < STAGGER_DUR + 8 * STAGGER_STAGGER ||
                (!reducedMotion && sceneState.text === THINKING_TEXT && sceneState.shimmerEpoch > 0);
            if (sceneDirty || contentAnimating) drawScene();

            const W = canvas.width;
            const H = canvas.height;
            const cx = W * 0.5;
            const cy = H * 0.5;

            // Угол и пульс слияния интегрируются по кадрам: смена скорости
            // ускоряет/замедляет движение, но не сдвигает фазу рывком
            if (!reducedMotion) {
                rotationAngle += dt * stateCurrent.rotationSpeed * Math.PI * 2;
                mergePhaseAccum += dt * stateCurrent.mergePhase;
            }
            const angle = rotationAngle;
            const mergePulse = (Math.sin(mergePhaseAccum * Math.PI * 2) + 1.0) / 2.0;

            let rTime = -1.0;
            let dispersionAmount = 0;
            if (rippleStart > 0) {
                rTime = (performance.now() - rippleStart) / 1000.0;
                if (rTime > 2.0) {
                    rippleStart = -1;
                    rTime = -1.0;
                } else {
                    dispersionAmount = (rTime * Math.exp(-rTime * 6.0)) * stateCurrent.rippleIntensity * 800.0;
                }
            }

            const maxSpread = (Math.PI * 2) / 3;
            const spread = maxSpread * (1.0 - (mergePulse * stateCurrent.magnetism));
            const orbitRadius = stateCurrent.orbitRadius * PARAMS.blobScale
                * (1 + breatheAmp * (0.5 - 0.5 * Math.cos((t * Math.PI * 2) / THINKING_BREATH_PERIOD)));

            const drops: number[] = [];
            for (let i = 0; i < 3; i++) {
                const a = angle - i * spread;
                let dx = cx + Math.cos(a) * orbitRadius;
                let dy = cy + Math.sin(a) * orbitRadius;

                if (dispersionAmount > 0) {
                    const vecX = dx - rippleX;
                    const vecY = dy - rippleY;
                    const dist = Math.sqrt(vecX * vecX + vecY * vecY) || 1.0;
                    const force = dispersionAmount / (1.0 + dist * 0.02);
                    dx += (vecX / dist) * force;
                    dy += (vecY / dist) * force;
                }

                drops.push(dx, dy, stateCurrent.dropRadius * PARAMS.blobScale * window.devicePixelRatio, stateCurrent.dropElongation);
            }

            for (let i = 0; i < 3; i++) drops[i * 4 + 1] = H - drops[i * 4 + 1];

            gl.uniform1f(uTime, t);
            gl.uniform4fv(uDrops, new Float32Array(drops));
            gl.uniform1f(uThreshold, stateCurrent.metaballThreshold);
            gl.uniform1f(uRefraction, stateCurrent.refraction * PARAMS.blobScale);
            gl.uniform1f(uDispersion, stateCurrent.dispersion);
            gl.uniform1f(uSpecular, stateCurrent.specular);
            gl.uniform1f(uGlossiness, stateCurrent.glossiness);
            gl.uniform1f(uFresnel, stateCurrent.fresnelDark);
            gl.uniform1f(uTint, stateCurrent.tintOpacity);
            gl.uniform1f(uGlow, stateCurrent.glowIntensity);
            gl.uniform2f(uMouse, mx, my);
            gl.uniform1f(uMouseMass, mx > -500 ? stateCurrent.mouseMass : 0.0);
            gl.uniform2f(uRipplePos, rippleX, rippleY);
            gl.uniform1f(uRippleTime, rTime);
            gl.uniform1f(uRippleInt, stateCurrent.rippleIntensity);
            gl.uniform1i(uEnableRipple, stateCurrent.enableClickRipple ? 1 : 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.uniform1i(uBg, 0);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            canvas.style.filter = stateCurrent.blur > 0 ? `blur(${stateCurrent.blur}px)` : 'none';

            if (shouldAnimateScene({ documentVisible, elementVisible, reducedMotion })) {
                rafId = requestAnimationFrame(render);
            }
        };

        const stopAnimation = () => {
            if (rafId !== 0) cancelAnimationFrame(rafId);
            rafId = 0;
        };

        const requestFrame = () => {
            if (disposed || !documentVisible || !elementVisible || rafId !== 0) return;
            lastFrame = performance.now();
            rafId = requestAnimationFrame(render);
        };

        requestFrameRef.current = requestFrame;

        const onVisibilityChange = () => {
            documentVisible = document.visibilityState === 'visible';
            if (documentVisible) requestFrame();
            else stopAnimation();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        const intersectionObserver = new IntersectionObserver(([entry]) => {
            elementVisible = entry?.isIntersecting ?? false;
            if (elementVisible) requestFrame();
            else stopAnimation();
        });
        intersectionObserver.observe(canvas);

        const onReducedMotionChange = (event: MediaQueryListEvent) => {
            reducedMotion = event.matches;
            stopAnimation();
            requestFrame();
        };
        reducedMotionQuery.addEventListener('change', onReducedMotionChange);
        requestFrame();

        let pane: Tweakpane.Pane | null = null;
        if (isDebugPaneEnabled()) {
            pane = new Tweakpane.Pane({ title: 'Glass Spinner Lab (debug)' });
            pane.addInput(PARAMS, 'format', { label: 'Scene Format', options: { Auto: 'auto', Dark: 'dark', Light: 'light' } });
            pane.addInput(PARAMS, 'blobScale', { min: 0.3, max: 1.2, step: 0.01, label: 'Blob Scale' });

            const restFolder = pane.addFolder({ title: '🛋 Rest state', expanded: false });
            addStateInputs(restFolder, STATE_PRESETS.rest);

            const thinkingFolder = pane.addFolder({ title: '🤔 Thinking state', expanded: false });
            addStateInputs(thinkingFolder, STATE_PRESETS.thinking);

            const vignetteFolder = pane.addFolder({ title: '🌫 Vignette' });
            vignetteFolder.addInput(PARAMS, 'vignetteStrong', { min: 0, max: 1, step: 0.01, label: 'Strength T/B' });
            vignetteFolder.addInput(PARAMS, 'vignetteStrongReach', { min: 0.05, max: 0.5, step: 0.01, label: 'Reach T/B' });
            vignetteFolder.addInput(PARAMS, 'vignetteSoft', { min: 0, max: 1, step: 0.01, label: 'Strength Sides' });
            vignetteFolder.addInput(PARAMS, 'vignetteSoftReach', { min: 0.05, max: 0.5, step: 0.01, label: 'Reach Sides' });

            const patternFolder = pane.addFolder({ title: '⚪ Dot Pattern', expanded: false });
            patternFolder.addInput(PARAMS, 'dotSpacing', { min: 10, max: 60, step: 1, label: 'Spacing (px)' });
            patternFolder.addInput(PARAMS, 'dotRadius', { min: 1, max: 20, step: 0.5, label: 'Dot Radius (px)' });
            patternFolder.addInput(PARAMS, 'dotOpacity', { min: 0.02, max: 0.6, step: 0.01, label: 'Opacity' });
            patternFolder.addInput(PARAMS, 'vignetteStrong', { min: 0, max: 1, step: 0.01, label: 'Vignette T/B' });
            patternFolder.addInput(PARAMS, 'vignetteSoft', { min: 0, max: 1, step: 0.01, label: 'Vignette Sides' });

            pane.on('change', () => {
                drawScene();
                requestFrame();
            });
        }

        return () => {
            disposed = true;
            requestFrameRef.current = () => undefined;
            stopAnimation();
            observer.disconnect();
            intersectionObserver.disconnect();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerleave', onPointerLeave);
            window.removeEventListener('pointerdown', onPointerDown);
            pane?.dispose();
            gl.deleteTexture(tex);
            gl.deleteBuffer(buf);
            gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Канвас через портал в body — фон всей страницы под всем хромом
    return createPortal(
        <canvas ref={canvasRef} className="blackbox-sphere-canvas" aria-hidden="true" />,
        document.body
    );
};
