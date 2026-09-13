"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./CareerTagSphere.module.css";

export type TagItem = {
  label: string;
  primary?: boolean;
};

const DEFAULT_TAGS: TagItem[] = [
  { label: "Опыт", primary: true },
  { label: "Результаты", primary: true },
  { label: "Навыки", primary: true },
  { label: "Цели", primary: true },
  { label: "Траектория", primary: true },
  { label: "Достижения" },
  { label: "Контекст" },
  { label: "Память" },
  { label: "Сигналы" },
  { label: "Возможности" },
];

const TRANSITION_DURATION_MS = 1_050;

type CareerTagSphereProps = {
  tags?: TagItem[];
  size?: number | string;
  speed?: number;
  interactive?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
};

type Point = { x: number; y: number; z: number };

export default function CareerTagSphere({
  tags = DEFAULT_TAGS,
  size = "min(82vw, 360px)",
  speed = 1,
  interactive = true,
  onStart,
  onComplete,
  className = "",
}: CareerTagSphereProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const startRef = useRef<HTMLButtonElement>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [started, setStarted] = useState(false);

  const motion = useRef({
    rotX: -0.12,
    rotY: -0.48,
    velX: 0.00009,
    velY: 0.00024,
    targetVelX: 0.00009,
    targetVelY: 0.00024,
    dragging: false,
    lastX: 0,
    lastY: 0,
    visible: true,
    inViewport: true,
    reducedMotion: false,
    started: false,
  });

  const points = useMemo<Point[]>(() => {
    const count = Math.max(tags.length, 1);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    return tags.map((_, index) => {
      const rawY = count === 1 ? 0 : 1 - (index / (count - 1)) * 2;
      const y = rawY * 0.92;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * index + 0.55;

      return {
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
      };
    });
  }, [tags]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const state = motion.current;
    state.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let animationFrame = 0;
    let lastFrame = performance.now();
    let sphereRadius = root.clientWidth * 0.34;

    const resizeObserver = new ResizeObserver(() => {
      sphereRadius = root.clientWidth * 0.34;
    });
    resizeObserver.observe(root);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        state.inViewport = entry.isIntersecting;
      },
      { rootMargin: "100px" },
    );
    intersectionObserver.observe(root);

    const handleVisibility = () => {
      state.visible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const rotate = (point: Point) => {
      const cosY = Math.cos(state.rotY);
      const sinY = Math.sin(state.rotY);
      const x = point.x * cosY + point.z * sinY;
      const z = -point.x * sinY + point.z * cosY;
      const cosX = Math.cos(state.rotX);
      const sinX = Math.sin(state.rotX);

      return {
        x,
        y: point.y * cosX - z * sinX,
        z: point.y * sinX + z * cosX,
      };
    };

    const renderFrame = (now: number) => {
      animationFrame = requestAnimationFrame(renderFrame);

      if (!state.visible || !state.inViewport || state.started) {
        lastFrame = now;
        return;
      }

      const delta = Math.min(now - lastFrame, 32);
      lastFrame = now;

      if (!state.reducedMotion && !state.dragging) {
        state.targetVelX += (0.00009 * speed - state.targetVelX) * 0.01;
        state.targetVelY += (0.00024 * speed - state.targetVelY) * 0.01;
        state.velX += (state.targetVelX - state.velX) * 0.035;
        state.velY += (state.targetVelY - state.velY) * 0.035;
        state.rotX += state.velX * delta;
        state.rotY += state.velY * delta;
      }

      const camera = 2.8;

      points.forEach((point, index) => {
        const element = tagRefs.current[index];
        if (!element) return;

        const rotated = rotate(point);
        const perspective = camera / (camera - rotated.z);
        const x = rotated.x * sphereRadius * perspective * 1.08;
        const y = rotated.y * sphereRadius * perspective;
        const depth = (rotated.z + 1) * 0.5;
        const scale = 0.78 + depth * 0.28;
        const opacity = 0.18 + depth * 0.82;

        element.dataset.x = String(x);
        element.dataset.y = String(y);
        element.dataset.depth =
          depth > 0.72 ? "front" : depth > 0.42 ? "mid" : "back";
        element.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${scale})`;
        element.style.opacity = opacity.toFixed(3);
        element.style.zIndex = String(Math.trunc(depth * 1_000));
      });
    };

    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [points, speed]);

  useEffect(
    () => () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    },
    [],
  );

  const stopDrag = () => {
    motion.current.dragging = false;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || motion.current.started) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const state = motion.current;
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;

    const state = motion.current;
    if (!state.dragging || state.started) return;

    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.rotY += deltaX * 0.006;
    state.rotX -= deltaY * 0.0048;
    state.targetVelY = deltaX * 0.00008;
    state.targetVelX = -deltaY * 0.00006;
  };

  const handleStart = () => {
    const state = motion.current;
    if (state.started) return;

    state.started = true;
    state.dragging = false;
    setStarted(true);
    onStart?.();

    const delay = state.reducedMotion ? 0 : TRANSITION_DURATION_MS;
    completionTimerRef.current = window.setTimeout(() => {
      onComplete?.();
      completionTimerRef.current = null;
    }, delay);

    if (state.reducedMotion) return;

    const root = rootRef.current;
    if (!root) return;
    const travel = Math.max(root.clientWidth, root.clientHeight) * 1.55;

    tagRefs.current.forEach((element, index) => {
      if (!element) return;

      const x = Number(element.dataset.x || 0);
      const y = Number(element.dataset.y || 0);
      let vectorX = x;
      let vectorY = y;
      let magnitude = Math.hypot(vectorX, vectorY);

      if (magnitude < 24) {
        const angle = (Math.PI * 2 * index) / tags.length;
        vectorX = Math.cos(angle);
        vectorY = Math.sin(angle);
        magnitude = 1;
      }

      vectorX /= magnitude;
      vectorY /= magnitude;

      const wobble =
        (index % 2 === 0 ? -1 : 1) * (0.1 + (index % 3) * 0.025);
      const rotatedX = vectorX * Math.cos(wobble) - vectorY * Math.sin(wobble);
      const rotatedY = vectorX * Math.sin(wobble) + vectorY * Math.cos(wobble);
      const depthMultiplier =
        element.dataset.depth === "front"
          ? 1.06
          : element.dataset.depth === "back"
            ? 0.92
            : 1;
      const distance = travel * depthMultiplier;
      const currentTransform = getComputedStyle(element).transform;

      element.animate(
        [
          {
            transform:
              currentTransform === "none"
                ? "translate(-50%, -50%)"
                : currentTransform,
            opacity: getComputedStyle(element).opacity,
            filter: "blur(0px)",
          },
          {
            transform: `translate3d(calc(-50% + ${x + rotatedX * distance * 0.55}px), calc(-50% + ${y + rotatedY * distance * 0.55}px), 0) scale(1.07)`,
            opacity: 0.68,
            offset: 0.58,
          },
          {
            transform: `translate3d(calc(-50% + ${x + rotatedX * distance}px), calc(-50% + ${y + rotatedY * distance}px), 0) scale(1.22)`,
            opacity: 0,
            filter: "blur(2px)",
          },
        ],
        {
          duration: 760 + (index % 4) * 70,
          delay: (index % 5) * 20,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "forwards",
        },
      );
    });

    startRef.current?.animate(
      [
        {
          transform: "translate(-50%, -50%) scale(1)",
          opacity: 1,
          filter: "blur(0px)",
        },
        {
          transform: "translate(-50%, -50%) scale(1.04)",
          opacity: 1,
          offset: 0.25,
        },
        {
          transform: "translate(-50%, -50%) scale(0.92)",
          opacity: 0,
          filter: "blur(5px)",
        },
      ],
      {
        duration: 620,
        delay: 90,
        easing: "cubic-bezier(.16,1,.3,1)",
        fill: "forwards",
      },
    );
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.sphere} ${started ? styles.isStarted : ""} ${className}`}
      style={
        {
          "--sphere-size": typeof size === "number" ? `${size}px` : size,
        } as CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <div className={styles.tagStage} aria-hidden="true">
        {tags.map((tag, index) => (
          <span
            key={`${tag.label}-${index}`}
            ref={(node) => {
              tagRefs.current[index] = node;
            }}
            className={`${styles.tag} ${tag.primary ? styles.primaryTag : ""}`}
            data-depth="mid"
          >
            {tag.label}
          </span>
        ))}
      </div>

      <button
        ref={startRef}
        type="button"
        className={styles.startWord}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleStart}
        aria-label="Начать знакомство со Стезей"
        disabled={started}
      >
        Начать
      </button>
    </div>
  );
}

