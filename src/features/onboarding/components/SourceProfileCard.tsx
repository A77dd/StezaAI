import Image from "next/image";
import type { CSSProperties, FormEvent } from "react";

import type {
  ProfileSource,
  SourceCardState,
} from "../profile-sources/profileSources.types";
import styles from "./SourceProfileCard.module.css";

type SourceProfileCardProps = {
  source: ProfileSource;
  state: SourceCardState;
  index: number;
  onQueryChange: (query: string) => void;
  onSubmit: (query: string) => void;
  onReject: () => void;
  onConfirm: () => void;
  onInputFocus: () => void;
};

type StaggerStyle = CSSProperties & { "--card-index": number };

export default function SourceProfileCard({
  source,
  state,
  index,
  onQueryChange,
  onSubmit,
  onReject,
  onConfirm,
  onInputFocus,
}: SourceProfileCardProps) {
  const titleId = `source-${source.id}-title`;
  const errorId = `source-${source.id}-error`;
  const isInputState = state.status === "idle" || state.status === "error";
  const isProfileState = state.status === "found" || state.status === "confirmed";
  const cardLabel =
    state.status === "confirmed"
      ? `Профиль ${source.name} подтвержден`
      : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.query.trim()) onSubmit(state.query);
  };

  return (
    <article
      className={`${styles.card} ${styles[state.status]}`}
      style={{ "--card-index": index } as StaggerStyle}
      aria-labelledby={cardLabel ? undefined : titleId}
      aria-label={cardLabel}
      data-status={state.status}
    >
      {isProfileState ? (
        <div className={styles.profileSummary}>
          <Image
            className={styles.avatar}
            src={state.profile.avatarPath}
            width={44}
            height={44}
            unoptimized
            alt={`Аватар: ${state.profile.name}`}
          />
          <div className={styles.profileCopy}>
            <p className={styles.sourceEyebrow} id={titleId}>
              {source.name}
            </p>
            <p className={styles.profileName}>{state.profile.name}</p>
            <p className={styles.profileRole}>{state.profile.role}</p>
          </div>
          {state.status === "confirmed" ? (
            <span className={styles.confirmedMark} aria-hidden="true">
              <CheckIcon />
            </span>
          ) : null}
        </div>
      ) : (
        <div className={styles.sourceSummary}>
          <span
            className={`${styles.serviceIcon} ${styles[source.accent]}`}
            aria-hidden="true"
          >
            {source.mark}
          </span>
          <div className={styles.sourceCopy}>
            <h2 className={styles.sourceName} id={titleId}>
              {source.name}
            </h2>
            {state.status === "searching" ? (
              <p className={styles.searchingLabel} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Ищем профиль...
              </p>
            ) : (
              <p className={styles.description}>{source.description}</p>
            )}
          </div>
        </div>
      )}

      {isInputState ? (
        <form
          className={styles.lookupForm}
          aria-label={`Поиск профиля ${source.name}`}
          onSubmit={submit}
        >
          <input
            className={styles.input}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={state.query}
            placeholder="Вставьте ссылку или @handle"
            aria-label={`Профиль ${source.name}`}
            aria-describedby={state.status === "error" ? errorId : undefined}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={onInputFocus}
          />
          <button
            className={styles.submitButton}
            type="submit"
            aria-label={`Найти профиль ${source.name}`}
            disabled={!state.query.trim()}
          >
            <ArrowIcon />
          </button>
          {state.status === "error" ? (
            <p className={styles.errorMessage} id={errorId} role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}

      {state.status === "found" ? (
        <div className={styles.decisions}>
          <button className={styles.secondaryButton} type="button" onClick={onReject}>
            Это не я
          </button>
          <button className={styles.primaryButton} type="button" onClick={onConfirm}>
            Да, это я
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10.4 3.1 3.1L15 6.7" />
    </svg>
  );
}
