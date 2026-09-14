import styles from "./OnboardingFlow.module.css";

export default function OnboardingNextPlaceholder() {
  return (
    <main className={styles.placeholder} aria-label="Следующий шаг онбординга">
      <div className={styles.placeholderContent}>
        <p className={styles.placeholderLabel}>Стезя</p>
        <h1 className={styles.placeholderTitle}>Следующий шаг</h1>
        <p className={styles.placeholderCopy}>
          Продолжение онбординга появится в следующем продуктовом срезе.
        </p>
      </div>
    </main>
  );
}
