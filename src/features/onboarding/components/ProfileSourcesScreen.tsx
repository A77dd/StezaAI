"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { ProfileLookup } from "../profile-sources/profileLookup";
import { ProfileLookupError } from "../profile-sources/mockProfileLookup";
import { PROFILE_SOURCES } from "../profile-sources/profileSources.config";
import {
  createInitialProfileSourcesState,
  profileSourcesReducer,
} from "../profile-sources/profileSources.reducer";
import type { ProfileSourceId } from "../profile-sources/profileSources.types";
import styles from "./ProfileSourcesScreen.module.css";
import SourceProfileCard from "./SourceProfileCard";

type ProfileSourcesScreenProps = {
  lookup: ProfileLookup;
  onComplete: () => void;
};

const UNEXPECTED_LOOKUP_ERROR = "Не удалось найти профиль. Попробуйте еще раз.";

export default function ProfileSourcesScreen({
  lookup,
  onComplete,
}: ProfileSourcesScreenProps) {
  const [state, dispatch] = useReducer(
    profileSourcesReducer,
    PROFILE_SOURCES,
    createInitialProfileSourcesState,
  );
  const requestSequence = useRef(0);
  const focusedCard = useRef<HTMLElement | null>(null);
  const focusTimer = useRef<number | null>(null);

  const hasConfirmedProfile = useMemo(
    () => Object.values(state).some((entry) => entry.status === "confirmed"),
    [state],
  );

  const scrollFocusedCard = useCallback(() => {
    if (!focusedCard.current) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    focusedCard.current.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }, []);

  const handleInputFocus = (input: HTMLInputElement) => {
    focusedCard.current = input.closest("article");
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(scrollFocusedCard, 220);
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", scrollFocusedCard);

    return () => {
      viewport?.removeEventListener("resize", scrollFocusedCard);
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    };
  }, [scrollFocusedCard]);

  const lookupProfile = async (sourceId: ProfileSourceId, query: string) => {
    const requestId = `profile-request-${++requestSequence.current}`;
    dispatch({ type: "lookupStarted", sourceId, query, requestId });

    try {
      const profile = await lookup.lookup(sourceId, query);
      dispatch({
        type: "lookupSucceeded",
        sourceId,
        requestId,
        profile,
      });
    } catch (error) {
      dispatch({
        type: "lookupFailed",
        sourceId,
        requestId,
        message:
          error instanceof ProfileLookupError
            ? error.message
            : UNEXPECTED_LOOKUP_ERROR,
      });
    }
  };

  return (
    <main className={styles.screen} aria-label="Добавление профилей">
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.scroller}>
        <div className={styles.content}>
          <header className={styles.header}>
            <span className={styles.brand}>Стезя</span>
            <button className={styles.skipButton} type="button" onClick={onComplete}>
              Заполню позже
            </button>
          </header>

          <section className={styles.introduction} aria-labelledby="profile-sources-title">
            <h1 className={styles.title} id="profile-sources-title">
              Начнем с того, что уже есть
            </h1>
            <p className={styles.subtitle}>
              Добавьте профили, чтобы Стезя лучше поняла ваш опыт, навыки и
              интересы.
            </p>
          </section>

          <div className={styles.cards}>
            {PROFILE_SOURCES.map((source, index) => (
              <SourceProfileCard
                key={source.id}
                source={source}
                state={state[source.id]}
                index={index}
                onQueryChange={(query) =>
                  dispatch({ type: "queryChanged", sourceId: source.id, query })
                }
                onSubmit={(query) => void lookupProfile(source.id, query)}
                onReject={() =>
                  dispatch({ type: "profileRejected", sourceId: source.id })
                }
                onConfirm={() =>
                  dispatch({ type: "profileConfirmed", sourceId: source.id })
                }
                onInputFocus={handleInputFocus}
              />
            ))}
          </div>
        </div>

        <footer className={styles.actionBar}>
          <div className={styles.actionInner}>
            <button
              className={styles.nextButton}
              type="button"
              disabled={!hasConfirmedProfile}
              onClick={onComplete}
            >
              Далее
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
